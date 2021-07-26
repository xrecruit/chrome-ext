// BUTTONS / ELEMENTS
const input_email = document.querySelector('#email')
const input_password = document.querySelector('#password')
const btn_submit = document.querySelector('#btn-submit')
const container_popup_ui = document.querySelector('#popup-ui')
const container_login_ui = document.querySelector('#login-ui')
const el_progress_fetching = document.querySelector('#progress-fetching')
const domain = document.querySelector('#domain')

// EVENT LISTENERS
btn_submit.addEventListener('click', async (evt) => {
    evt.preventDefault();
    const email = input_email.value
    const password = input_password.value

    if (validateEmail(email) && password) {
        const payload = { email: email, password: password, remember_me: true }

        try {
            const res = await axios.post(`${domain.value}/user/login`, payload)
            const { status, token } = res.data || {}
            if (status) {
                await axios.post(`${domain.value}/user/update/profile?accessToken=${token}`, { extensionLogin: true })
            }
            const signIn = true

            chrome.storage.local.set({ userStatus: signIn, user_info: res.data, domain: domain.value }, function (response) {
                // check if container popup has "d-none" class
                const isContainerPopupNotVisible = container_popup_ui.classList.contains('d-none')
                const isContainerLoginNotVisible = container_login_ui.classList.contains('d-none')

                if (isContainerPopupNotVisible) {
                    container_popup_ui.classList.remove('d-none')

                    fetchProfiles(res.data, domain.value).then(res => {
                        if (jobProfiles.length) {
                            chrome.storage.local.get(['userStatus', 'user_info', 'naukriProfile'], function (response) {
                                el_progress_fetching.classList.remove('d-none')
                                extractResumesFromWebPage(response)
                            })
                        }
                    })
                }

                if (!isContainerLoginNotVisible) {
                    container_login_ui.classList.add('d-none')
                }
            });

        } catch (error) {
            handleErrorMessages('Something went wrong try again!')
        }
    }
})

// FUNCTIONS
function validateEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}