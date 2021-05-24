var baseURLNaukri = 'https://rms.naukri.com'
var baseURLIndeed = 'https://employers.indeed.com'
var portal = null
var csrfToken = null

async function exeURL(url, specialFormat, headersCD) {
    try {
        let params = {}
        if (specialFormat) {
            params = {
                responseType: 'arraybuffer'
            }
        }
        let response = await axios.get(url, params);
        if (specialFormat) {
            var uInt8Array = new Uint8Array(response.data)
            var i = uInt8Array.length;
            var biStr = new Array(i);
            while (i--) {
                biStr[i] = String.fromCharCode(uInt8Array[i]);
            }
            var data = biStr.join('');
            var base64 = window.btoa(data);

            if (headersCD) {
                let fileName = response.headers['content-disposition']
                fileName = fileName.split('=')[1].replace(/['"]+/g, '')
                return { base64, fileName }
            } else {
                return base64
            }
        } else {
            return await response.data
        }
    } catch (error) {
        throw error
    }
}

function getApplicationID(href) {
    let url = href.split('?')[0].split('/').pop()
    return url
}

function fetchAllUrls() {
    const urls = Array.from(document.querySelectorAll('#ques_list>li')).reduce((result, ql) => {
        const profile = ql.querySelector('.profile').querySelector('em')
        const a = profile.querySelector('a');

        if (profile.contains(a)) {
            result.push(a.href)
        }

        return result
    }, [])
    return urls
}

// INDEED >>>
async function fetchAllJobInfo() {
    const url = `${baseURLIndeed}/api/ctws/preview/candidates?offset=0&indeedClientApplication=cpqa&indeedcsrftoken=${csrfToken}`
    const res = await axios.get(url)
    const { jobInfo } = res.data

    return jobInfo.filter(ji => ji.status === "ACTIVE")
}

async function fetchCandidatesInfo(id) {
    const url = `${baseURLIndeed}/api/ctws/preview/candidates?offset=0&encryptedJobId=${id}&indeedClientApplication=cpqa&indeedcsrftoken=${csrfToken}`

    const res = await axios.get(url)
    const { candidates } = res.data

    // fetch and set candidate email
    await Promise.all(
        candidates.map(async c => {
            const getEmailUrl = `${baseURLIndeed}/c/ats/api/candidates?cid=${c.candidateId}&includeOptionalAttributes=true`
            try {
                const userData = await axios.get(getEmailUrl)
                c['email'] = userData.data.data.candidates[0].email
                return c
            } catch (error) {
                throw error
            }
        })
    )
    return candidates
}

function formatedDate(timestamp) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    var d = new Date(timestamp).getDate()
    var m = new Date(timestamp).getMonth()
    var y = new Date(timestamp).getFullYear().toString().substr(-2)

    return `${d} ${months[m]} ${y}`
}

// Listen to messages from popup.js
chrome.runtime.onConnect.addListener(function (port) {
    if (portal === 'naukri') {
        port.onMessage.addListener(async function (msg) {
            const { naukriProfile } = msg
            const urls = fetchAllUrls()

            for (const url of urls) {
                let existingEmails = []
                const res = await exeURL(url)
                const doc = document.createElement("div");
                doc.innerHTML = res;

                var candidateNodes = doc.querySelectorAll('.candDet')
                var profile = doc.querySelector('.hText').title.split(':')[1].trim()
                var profileUID = doc.querySelector('.quesPara').querySelector('small').innerHTML.trim()

                const hasId = naukriProfile ? naukriProfile.find(np => np.id === profileUID) : undefined
                if (hasId) {
                    const { sentProfiles } = hasId
                    existingEmails = sentProfiles
                }

                var resumes = await Promise.all(
                    [...candidateNodes].map(async (node) => {
                        var email = node.querySelector('#emailIdForDisplay').title
                        if (!existingEmails.includes(email)) {
                            try {
                                let resumeBase64 = "NOT FOUND"
                                let hasResume = false
                                let portal = 'naukri'
                                var inboxVerify = node.querySelector('.inboxVerify').querySelectorAll('span')
                                var filteredInboxVerifySpan = [...inboxVerify].find(iv => iv.innerHTML.includes('Applied On'))
                                var appliedon = filteredInboxVerifySpan.innerText.split(":")[1].trim()
                                var profileId = node.querySelector('input[type=checkbox]').value
                                var applicationId = getApplicationID(node.querySelector('.candName').querySelector('a').href)
                                var linkToFindDocumentId = `${baseURLNaukri}/document/profile/${profileId}/candidatedocuments?limit=5&applicationId=${applicationId}`

                                let preDownloadDetails = await exeURL(linkToFindDocumentId)

                                if (preDownloadDetails && preDownloadDetails.documents.length) {
                                    let endURL = preDownloadDetails.documents[0].downloadLink
                                    let documentExtension = preDownloadDetails.documents[0].documentExtension
                                    let documentName = preDownloadDetails.documents[0].documentName
                                    resumeBase64 = await exeURL(baseURLNaukri + endURL, true)
                                    hasResume = true
                                    return { email, resumeBase64, hasResume, documentExtension, documentName, appliedon, portal }
                                } else {
                                    return { email, resumeBase64, hasResume, appliedon, portal }
                                }
                            } catch (error) {
                                throw error
                            }
                        }
                    })
                )
                resumes = resumes.length ? resumes.filter(r => r && r.hasResume) : []
                port.postMessage({ data: resumes, profile, profileUID })
            }
            port.postMessage({ done: true })
        });
    } else if (portal === 'indeed') { // INDEED
        port.onMessage.addListener(async function (msg) {
            const { naukriProfile } = msg

            const jobInformation = await fetchAllJobInfo()

            for (const jobInfo of jobInformation) {
                let existingEmails = []
                let hasResume = true

                const { jobId } = jobInfo
                const profile = jobInfo.title
                const profileUID = jobInfo.jobId


                const candidates = await fetchCandidatesInfo(jobId)

                const hasId = naukriProfile ? naukriProfile.find(np => np.id === profileUID) : undefined
                if (hasId) {
                    const { sentProfiles } = hasId
                    existingEmails = sentProfiles
                }

                var resumes = await Promise.all(
                    candidates.map(async cand => {
                        const { candidateId } = cand

                        if (!existingEmails.includes(cand.email)) {
                            try {
                                const url = `${baseURLIndeed}/c/resume?id=${candidateId}&ctx=draw-candidatedetails&isPDFView=false`
                                const base64WithCD = await exeURL(url, true, true)

                                cand.base64 = base64WithCD.base64
                                cand.docType = base64WithCD.fileName.split('.')[1]

                                const candPayload = {
                                    email: cand.email,
                                    resumeBase64: cand.base64,
                                    hasResume: hasResume,
                                    documentExtension: cand.docType,
                                    documentName: base64WithCD.fileName,
                                    appliedon: formatedDate(cand.dateCreatedTimestamp),
                                    portal: 'indeed'
                                }

                                return candPayload
                            } catch (error) {
                                throw error
                            }
                        }
                    })
                )
                resumes = resumes.length ? resumes.filter(r => r && r.hasResume) : []
                port.postMessage({ data: resumes, profile, profileUID })
            }
            port.postMessage({ done: true })
        });
    } else {
        let msg = `current portal is ${portal}`
        if (!portal) {
            msg = `close this tab and reopen`
            port.postMessage({ msg })
        } else {
            port.postMessage({ msg })
        }
        port.postMessage({ done: true })
    }
});


// Listen to messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const c = JSON.parse(message.c)

    if (c.name === 'CSRF') {
        csrfToken = c.value
    }

    portal = message.portal
});