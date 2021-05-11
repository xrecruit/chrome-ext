var baseURL = 'https://rms.naukri.com'

async function exeURL(url, specialFormat) {
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

            return base64
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

// Listen to messages from popup.js
chrome.runtime.onConnect.addListener(function (port) {
    const url = location.href
    const allowedUrl = 'https://rms.naukri.com/admin/homePage'

    if (url !== allowedUrl) {
        const msg = `Incorrect page, click <a href="https://rms.naukri.com/admin/homePage" target="_blank">here</a>`
        port.postMessage({ msg })
    } else {
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
                                var inboxVerify = node.querySelector('.inboxVerify').querySelectorAll('span')
                                var filteredInboxVerifySpan = [...inboxVerify].find(iv => iv.innerHTML.includes('Applied On'))
                                var appliedon = filteredInboxVerifySpan.innerText.split(":")[1].trim()
                                var profileId = node.querySelector('input[type=checkbox]').value
                                var applicationId = getApplicationID(node.querySelector('.candName').querySelector('a').href)
                                var linkToFindDocumentId = `${baseURL}/document/profile/${profileId}/candidatedocuments?limit=5&applicationId=${applicationId}`

                                let preDownloadDetails = await exeURL(linkToFindDocumentId)

                                if (preDownloadDetails && preDownloadDetails.documents.length) {
                                    let endURL = preDownloadDetails.documents[0].downloadLink
                                    let documentExtension = preDownloadDetails.documents[0].documentExtension
                                    let documentName = preDownloadDetails.documents[0].documentName
                                    resumeBase64 = await exeURL(baseURL + endURL, true)
                                    hasResume = true
                                    return { email, resumeBase64, hasResume, documentExtension, documentName, appliedon }
                                } else {
                                    return { email, resumeBase64, hasResume, appliedon }
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
    }
});