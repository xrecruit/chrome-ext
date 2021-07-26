// BUTTONS / ELEMENTS
const btn = document.querySelector('.btn-sync')
const btn_logout = document.querySelector('#logout')
const btn_spinner = document.querySelector('.btn__spinner')
const span_availableResumes = document.querySelector('#availableResumes')
const select_selectedProfiles = document.querySelector('#selectedProfiles')
const el_error = document.querySelector('.error')
const container_progress_resume_sent = document.querySelector('#container-progress-resume-sent')
const el_progress_resume_sent = document.querySelector('#progress-resume-sent')

// VARIABLES / STATE
var jobProfiles = []
var availableResumes = 0
var currProfile = []
var currProfileID = ""
var resumeData = []
var transitionEndEventName = getTransitionEndEventName();
var totalResumeSent = 0
var userInfo = {}
var domainUrl = "";

// EVENT LISTENERS
document.addEventListener("DOMContentLoaded", function () {
    chrome.storage.local.get(['domain'], function (response) {
        domainUrl = response.domain;
    })

    btn.addEventListener('click', async () => {

        let catchError = false

        if (!availableResumes) return

        // reset SYNC button background && totalResumeSent
        btn.querySelector('.btn__text').style.background = '#3e3e3e'
        totalResumeSent = 0

        // GET ALL DROPDOWNS & SELECED VALUES
        const dropdowns = document.querySelector('#dynamic-dropdowns').querySelectorAll('select')
        for (const dd of dropdowns) {
            const currProfileID = dd.id
            const value = dd.options[dd.selectedIndex].value;

            // get saved "naukriProfile" from local storage
            let lsnp = await getLocalStorage("naukriProfile")

            if (lsnp.length) {
                lsnp = lsnp.map(ls => {
                    if (ls.id === currProfileID) {
                        ls.isSelected = true
                        ls.preferredName = value
                    }
                    return ls
                })
                chrome.storage.local.set({ naukriProfile: lsnp }, (res) => { });
            }

            const pID = jobProfiles.find(f => f.title === value)

            const resumes = resumeData.filter(f => f.profileUID === currProfileID).map(rd => {
                rd.profile = value
                rd.profileID = pID ? pID._id : null
                return rd
            }).filter(f => f.hasResume)

            container_progress_resume_sent.classList.remove('d-none')

            const { token } = userInfo
            for (const resume of resumes) {
                toggleLoading()
                try {
                    await axios.post(`${domainUrl}/email/add-manual-bulk?accessToken=${token}`, resume)

                    if (lsnp.length) {
                        lsnp = lsnp.map(ls => {
                            if (ls.id === currProfileID) {
                                ls.sentProfiles.push(resume.email)
                            }
                            return ls
                        })
                        chrome.storage.local.set({ naukriProfile: lsnp }, function (res) { });
                    }

                    totalResumeSent = totalResumeSent + 1
                    updateTotalResumeSentDom(availableResumes)
                } catch (error) {
                    handleErrorMessages('Something went wrong')
                    catchError = true
                } finally {
                    toggleLoading()
                }
            }

        }
        container_progress_resume_sent.classList.add('d-none')
        if (catchError) {
            setTimeout(() => {
                handleErrorMessages('Something went wrong, recheck DB to ensure all resumes saved properly')
            }, 4000);
            // set SYNC button background to danger
            btn.querySelector('.btn__text').style.background = '#dc3545'
        } else {
            // set SYNC button background to success
            btn.querySelector('.btn__text').style.background = '#198754'
        }
    })

    btn_logout.addEventListener('click', async () => {
        const { token } = userInfo
        axios.post(`${domainUrl}/user/update/profile?accessToken=${token}`, { extensionLogin: false })

        const signIn = false
        chrome.storage.local.set({ userStatus: signIn, user_info: {} }, function (response) {
            // check if container popup has d-none class
            const isContainerPopupNotVisible = container_popup_ui.classList.contains('d-none')
            const isContainerLoginNotVisible = container_login_ui.classList.contains('d-none')

            if (isContainerLoginNotVisible) {
                container_login_ui.classList.remove('d-none')
            }

            if (!isContainerPopupNotVisible) {
                container_popup_ui.classList.add('d-none')
            }
        });

        // chrome.storage.local.remove(['userStatus', 'user_info', 'naukriProfile']);
        clearState()
    })
});


// FUNCTIONS
function setResumeCount(count) {
    span_availableResumes.innerHTML = count
}

function extractResumesFromWebPage(ls) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const { naukriProfile = [] } = ls || {}
        const payload = { naukriProfile }
        var extPort = chrome.tabs.connect(
            tabs[0].id,
            { name: "naukri-ext" }
        );
        extPort.postMessage(payload);

        extPort.onMessage.addListener(function (response) {
            const { done, msg } = response || {}

            if (msg) {
                handleErrorMessages(msg)
                el_progress_fetching.classList.add('d-none')
            } else if (done) {
                el_progress_fetching.classList.add('d-none')
            } else {
                const { data } = response
                if (data && data.length) {
                    allowNewResumesOnly(response).then(rd => {
                        if (rd && rd.length) {
                            let currProfile = filteredJobProfiles(response.profile)
                            if (currProfile.length) {
                                resumeData = [...resumeData, ...rd.map(m => {
                                    m.profile = response.profile
                                    m.profileUID = response.profileUID
                                    return m
                                })]
                                let currProfileID = response.profileUID

                                // ONLY CREATE DROPDOWN IF PROFILE EXISTS IN THE BACKEND
                                availableResumes = resumeData.filter(d => d.hasResume).length
                                setLocalStorage(currProfile, response)

                                // CREATE DYNAMIC DROPDOWNS
                                var select = document.createElement("select");
                                select.name = response.profile;
                                select.id = response.profileUID
                                select.className = "form-select form-select-sm"

                                let values = [];
                                // create values for dropdown
                                currProfile.forEach(el => {
                                    values.push(el.title)
                                });

                                for (const val of values) {
                                    var option = document.createElement("option");
                                    option.value = val;
                                    option.text = val;
                                    select.appendChild(option);
                                }

                                var label = document.createElement("label");
                                label.innerHTML = response.profile
                                label.htmlFor = response.profileUID;
                                label.className = "d-block mb-3 text-muted"

                                document.getElementById("dynamic-dropdowns").appendChild(label).appendChild(select);


                                getLocalStorage("naukriProfile").then(lsnp => {
                                    if (lsnp && lsnp.length) {
                                        const found = lsnp.find(f => f.id === currProfileID)
                                        if (found && found.isSelected) {
                                            select.value = found.preferredName;
                                        }
                                    }
                                })

                                setResumeCount(availableResumes)
                            }
                        }
                        // CHECK IF DROPDOWNS ARE THERE
                        const dropdowns = document.querySelector('#dynamic-dropdowns').querySelectorAll('select')
                        if (dropdowns && dropdowns.length) {
                            container_popup_ui.style.marginBottom = "120px"
                        }
                    })
                }
            }
        });
    })
}

function filteredJobProfiles(str) {
    return jobProfiles.filter(jp => jp.title.toLowerCase().includes(str.toLowerCase().split(' ')[0]))
}

function getTransitionEndEventName() {
    var transitions = {
        "transition": "transitionend",
        "OTransition": "oTransitionEnd",
        "MozTransition": "transitionend",
        "WebkitTransition": "webkitTransitionEnd"
    }
    let bodyStyle = document.body.style;
    for (let transition in transitions) {
        if (bodyStyle[transition] != undefined) {
            return transitions[transition];
        }
    }
}

function handleTransitionEnd() {
    btn_spinner.removeEventListener(transitionEndEventName, handleTransitionEnd);
    btn.classList.remove('-loop')
}

function toggleLoading() {
    btn.classList.toggle('-loading')

    if (btn.classList.contains('-loading')) {
        btn.classList.add('-loop')
    } else {
        btn_spinner.addEventListener(transitionEndEventName, handleTransitionEnd)
    }
}

window.onload = () => {
    chrome.storage.local.get(['userStatus', 'user_info', 'naukriProfile'], function name(response) {
        // check if container popup has d-none class
        const isContainerPopupNotVisible = container_popup_ui.classList.contains('d-none')
        const isContainerLoginNotVisible = container_login_ui.classList.contains('d-none')

        if (response.userStatus) {
            userInfo = response.user_info

            if (isContainerPopupNotVisible) {
                container_popup_ui.classList.remove('d-none')
            }

            if (!isContainerLoginNotVisible) {
                container_login_ui.classList.add('d-none')
            }

            fetchProfiles().then(res => {
                if (jobProfiles.length) {
                    el_progress_fetching.classList.remove('d-none')
                    extractResumesFromWebPage(response)
                }
            })


        } else {
            if (!isContainerPopupNotVisible) {
                container_popup_ui.classList.add('d-none')
            }
            if (isContainerLoginNotVisible) {
                container_login_ui.classList.remove('d-none')
            }
        }
    })
}

function handleErrorMessages(msg) {
    el_error.classList.remove('d-none')
    el_error.innerHTML = msg
    setTimeout(() => {
        el_error.innerHTML = ""
        el_error.classList.add('d-none')
    }, 4000);
}

function updateTotalResumeSentDom(totalResumes) {
    let percent = totalResumeSent / totalResumes * 100;
    percent = Math.max(percent, 1);

    el_progress_resume_sent.style.width = `${percent.toString()}%`
    el_progress_resume_sent['aria-valuenow'] = percent.toString()
    el_progress_resume_sent.innerHTML = Math.round(percent) + '%'
}

async function setLocalStorage(availableProfilesInDB, response) {
    const ls = await getLocalStorage(null);

    if (Object.keys(ls).length && ls.naukriProfile) {
        const isAlreadyExists = ls.naukriProfile.find(f => f.id === response.profileUID)
        if (isAlreadyExists) {
            // other stuff can be done
            return
        } else {
            // if not exists then add it to the local storage
            let arr = [
                {
                    id: response.profileUID,
                    isSelected: false,
                    preferredName: '',
                    availableOptions: availableProfilesInDB.map(m => m.title),
                    sentProfiles: []
                },
                ...ls.naukriProfile
            ]
            chrome.storage.local.set({ naukriProfile: arr }, (res) => { });
        }
    } else {
        // if local storage is empty add first item
        let arr = [
            {
                id: response.profileUID,
                isSelected: false,
                preferredName: '',
                availableOptions: availableProfilesInDB.map(m => m.title),
                sentProfiles: []
            },
        ]
        chrome.storage.local.set({ naukriProfile: arr }, (res) => { });
    }
}

async function getLocalStorage(key) {
    // pass null in place of key to get all the data stored inside local storage
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, resolve);
    })
        .then(result => {
            if (key == null) return result;
            else return result[key];
        });
}

async function allowNewResumesOnly(res) {
    let resumes = res && res.data ? res.data : []
    let lsnp = await getLocalStorage("naukriProfile")

    if (lsnp && lsnp.length && resumes.length) {
        const isAvailable = lsnp.find(f => f.id === res.profileUID)
        if (isAvailable) {
            const { sentProfiles } = isAvailable
            resumes = resumes.filter(d => {
                if (!sentProfiles.includes(d.email) && d.hasResume) return d
            })
        }
    }

    return resumes
}

async function fetchProfiles(ud = null, domain) {
    chrome.storage.local.get(['domain'], function (response) {
        domainUrl = response.domain;
    })
    const { token } = ud || userInfo
    if (ud) {
        userInfo = ud
    }
    const profiles = await axios.get(`${domain ? domain : domainUrl}/job-profile/list?accessToken=${token}`)
    if (!profiles.data.length) {
        handleErrorMessages('Error fetching profiles, try again')
    }

    jobProfiles = profiles.data.filter(item => item.active_status);
    chrome.storage.local.set({ naukriProfile: jobProfiles })
}

// clearLSSentProfiles()
async function clearLSSentProfiles() {
    let lsnp = await getLocalStorage("naukriProfile")

    if (lsnp.length) {
        lsnp = lsnp.map(ls => {
            ls.sentProfiles = []
            return ls
        })
        chrome.storage.local.set({ naukriProfile: lsnp }, (res) => { });
    }
}

function clearState() {
    availableResumes = 0
    currProfile = []
    currProfileID = ""
    resumeData = []
    totalResumeSent = 0
    domainUrl = '';
    setResumeCount("0")
    const container = document.querySelector('#dynamic-dropdowns');
    removeAllChildNodes(container);
    container_popup_ui.style.marginBottom = "0px"
}

function removeAllChildNodes(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }
}
