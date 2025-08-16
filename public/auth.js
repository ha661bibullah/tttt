// Authentication JavaScript for Gmail Registration and Database Login
const API_BASE_URL = "http://localhost:5000/api"

// Global variables
let currentUserEmail = ""
const authToken = localStorage.getItem("authToken")

// Initialize authentication on page load
document.addEventListener("DOMContentLoaded", () => {
  initializeAuth()
  setupEventListeners()
})

// Initialize authentication state
function initializeAuth() {
  const token = localStorage.getItem("authToken")
  const userData = localStorage.getItem("userData")

  if (token && userData) {
    // Verify token with server
    verifyTokenWithServer(token)
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Login form
  const loginForm = document.getElementById("loginForm")
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin)
  }

  // Email check form (for registration)
  const emailCheckForm = document.getElementById("emailCheckForm")
  if (emailCheckForm) {
    emailCheckForm.addEventListener("submit", handleEmailCheck)
  }

  // OTP verification form
  const otpForm = document.getElementById("otpVerificationForm")
  if (otpForm) {
    otpForm.addEventListener("submit", handleOTPVerification)
  }

  // Signup completion form
  const signupForm = document.getElementById("signupForm")
  if (signupForm) {
    signupForm.addEventListener("submit", handleSignupCompletion)
  }

  // Forgot password form
  const forgotPasswordForm = document.getElementById("forgotPasswordForm")
  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", handleForgotPassword)
  }

  // Reset password form
  const resetPasswordForm = document.getElementById("resetPasswordForm")
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", handleResetPassword)
  }

  // OTP input handling
  setupOTPInputs()
}

// Handle login form submission
async function handleLogin(e) {
  e.preventDefault()

  const email = document.getElementById("loginEmail").value.trim()
  const password = document.getElementById("loginPassword").value

  // Validate inputs
  if (!validateEmail(email)) {
    showError("loginEmailError", "অনুগ্রহ করে একটি সঠিক ইমেইল প্রদান করুন")
    return
  }

  if (!password) {
    showError("loginPasswordError", "পাসওয়ার্ড প্রয়োজন")
    return
  }

  try {
    showLoading("লগইন করা হচ্ছে...")

    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()

    if (response.ok) {
      localStorage.setItem("authToken", data.token)
      localStorage.setItem("userData", JSON.stringify(data.user))

      hideLoading()
      showSuccess("সফলভাবে লগইন হয়েছে!")

      // Close login popup and redirect or update UI
      closeLoginPopup()
      updateUIAfterLogin(data.user)
    } else {
      hideLoading()
      showError("loginPasswordError", data.message || "লগইন ব্যর্থ হয়েছে")
    }
  } catch (error) {
    hideLoading()
    console.error("Login error:", error)
    showError("loginPasswordError", "সার্ভার এরর। পরে চেষ্টা করুন।")
  }
}

// Handle email check for registration
async function handleEmailCheck(e) {
  e.preventDefault()

  const email = document.getElementById("checkEmail").value.trim()

  if (!validateEmail(email)) {
    showError("checkEmailError", "অনুগ্রহ করে একটি সঠিক ইমেইল প্রদান করুন")
    return
  }

  try {
    showLoading("OTP পাঠানো হচ্ছে...")

    const response = await fetch(`${API_BASE_URL}/send-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    })

    const data = await response.json()

    if (response.ok) {
      currentUserEmail = email
      document.getElementById("userEmail").textContent = email

      hideLoading()
      toggleForm("otpVerification")
      startOTPTimer()
    } else {
      hideLoading()
      showError("checkEmailError", data.message || "OTP পাঠাতে সমস্যা হয়েছে")
    }
  } catch (error) {
    hideLoading()
    console.error("OTP send error:", error)
    showError("checkEmailError", "সার্ভার এরর। পরে চেষ্টা করুন।")
  }
}

// Handle OTP verification
async function handleOTPVerification(e) {
  e.preventDefault()

  const otp = getOTPValue()

  if (otp.length !== 4) {
    showError("otpError", "অনুগ্রহ করে ৪ সংখ্যার OTP দিন")
    return
  }

  try {
    showLoading("OTP যাচাই করা হচ্ছে...")

    const response = await fetch(`${API_BASE_URL}/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: currentUserEmail,
        otp: otp,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      hideLoading()
      toggleForm("signup")
    } else {
      hideLoading()
      showError("otpError", data.message || "অবৈধ OTP")
    }
  } catch (error) {
    hideLoading()
    console.error("OTP verification error:", error)
    showError("otpError", "সার্ভার এরর। পরে চেষ্টা করুন।")
  }
}

// Handle signup completion
async function handleSignupCompletion(e) {
  e.preventDefault()

  const name = document.getElementById("signupName").value.trim()
  const password = document.getElementById("signupPassword").value
  const confirmPassword = document.getElementById("signupConfirmPassword").value

  // Validate inputs
  if (!name) {
    showError("signupNameError", "নাম প্রয়োজন")
    return
  }

  if (password.length < 6) {
    showError("signupPasswordError", "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে")
    return
  }

  if (password !== confirmPassword) {
    showError("signupConfirmPasswordError", "পাসওয়ার্ড মিলছে না")
    return
  }

  try {
    showLoading("রেজিস্ট্রেশন সম্পন্ন করা হচ্ছে...")

    const response = await fetch(`${API_BASE_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email: currentUserEmail,
        password,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      localStorage.setItem("authToken", data.token)
      localStorage.setItem("userData", JSON.stringify(data.user))

      hideLoading()

      // Show success modal
      document.getElementById("successModal").style.display = "flex"
    } else {
      hideLoading()
      showError("signupNameError", data.message || "রেজিস্ট্রেশন ব্যর্থ হয়েছে")
    }
  } catch (error) {
    hideLoading()
    console.error("Registration error:", error)
    showError("signupNameError", "সার্ভার এরর। পরে চেষ্টা করুন।")
  }
}

// Handle forgot password
async function handleForgotPassword(e) {
  e.preventDefault()

  const email = document.getElementById("forgotEmail").value.trim()

  if (!validateEmail(email)) {
    showError("forgotEmailError", "অনুগ্রহ করে একটি সঠিক ইমেইল প্রদান করুন")
    return
  }

  try {
    showLoading("OTP পাঠানো হচ্ছে...")

    const response = await fetch(`${API_BASE_URL}/send-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    })

    const data = await response.json()

    if (response.ok) {
      currentUserEmail = email
      hideLoading()
      showSuccess("আপনার ইমেইলে OTP পাঠানো হয়েছে")
      toggleForm("resetPassword")
    } else {
      hideLoading()
      showError("forgotEmailError", data.message || "OTP পাঠাতে সমস্যা হয়েছে")
    }
  } catch (error) {
    hideLoading()
    console.error("Forgot password error:", error)
    showError("forgotEmailError", "সার্ভার এরর। পরে চেষ্টা করুন।")
  }
}

// Handle reset password
async function handleResetPassword(e) {
  e.preventDefault()

  const newPassword = document.getElementById("resetNewPassword").value
  const confirmPassword = document.getElementById("resetConfirmPassword").value

  if (newPassword.length < 6) {
    showError("resetNewPasswordError", "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে")
    return
  }

  if (newPassword !== confirmPassword) {
    showError("resetConfirmPasswordError", "পাসওয়ার্ড মিলছে না")
    return
  }

  try {
    showLoading("পাসওয়ার্ড পরিবর্তন করা হচ্ছে...")

    // Here you would implement password reset logic
    // For now, showing success
    hideLoading()
    document.getElementById("passwordResetSuccessModal").style.display = "flex"
  } catch (error) {
    hideLoading()
    console.error("Reset password error:", error)
    showError("resetNewPasswordError", "সার্ভার এরর। পরে চেষ্টা করুন।")
  }
}

// Verify token with server
async function verifyTokenWithServer(token) {
  try {
    const response = await fetch(`${API_BASE_URL}/verify-token`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })

    if (response.ok) {
      const userData = await response.json()
      localStorage.setItem("userData", JSON.stringify(userData))
      updateUIAfterLogin(userData)
    } else {
      // Token is invalid, clear storage
      localStorage.removeItem("authToken")
      localStorage.removeItem("userData")
    }
  } catch (error) {
    console.error("Token verification error:", error)
    localStorage.removeItem("authToken")
    localStorage.removeItem("userData")
  }
}

// Update UI after successful login
function updateUIAfterLogin(user) {
  const loginButton = document.querySelector(".login-button")
  if (loginButton) {
    loginButton.innerHTML = `<i class="fas fa-user"></i> ${user.name}`
    loginButton.onclick = showUserMenu
  }

  // Show user courses if any
  if (user.courses && user.courses.length > 0) {
    console.log("User has access to courses:", user.courses)
    // Update course access UI here
  }

  console.log("User logged in:", user)
}

// Show user menu (logout option)
function showUserMenu() {
  const userMenu = document.createElement("div")
  userMenu.className = "user-menu"
  userMenu.innerHTML = `
        <div class="user-menu-content">
            <p>আপনি লগইন আছেন</p>
            <button onclick="logout()" class="logout-btn">লগআউট</button>
        </div>
    `

  document.body.appendChild(userMenu)

  // Remove menu when clicking outside
  setTimeout(() => {
    document.addEventListener("click", (e) => {
      if (!userMenu.contains(e.target)) {
        userMenu.remove()
      }
    })
  }, 100)
}

// Logout function
function logout() {
  localStorage.removeItem("authToken")
  localStorage.removeItem("userData")

  // Reset UI
  const loginButton = document.querySelector(".login-button")
  if (loginButton) {
    loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> লগইন'
    loginButton.onclick = openLoginPopup
  }

  // Remove user menu
  const userMenu = document.querySelector(".user-menu")
  if (userMenu) {
    userMenu.remove()
  }

  showSuccess("সফলভাবে লগআউট হয়েছে")
}

// Utility functions
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function showError(elementId, message) {
  const errorElement = document.getElementById(elementId)
  if (errorElement) {
    errorElement.textContent = message
    errorElement.classList.add("show-error")
  }
}

function hideError(elementId) {
  const errorElement = document.getElementById(elementId)
  if (errorElement) {
    errorElement.classList.remove("show-error")
  }
}

function showSuccess(message) {
  // Create and show success notification
  const notification = document.createElement("div")
  notification.className = "success-notification"
  notification.textContent = message
  notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4caf50;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 10000;
        font-weight: bold;
    `

  document.body.appendChild(notification)

  setTimeout(() => {
    notification.remove()
  }, 3000)
}

function showLoading(message) {
  const loader = document.createElement("div")
  loader.id = "loadingOverlay"
  loader.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `
  loader.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10001;
    `

  document.body.appendChild(loader)
}

function hideLoading() {
  const loader = document.getElementById("loadingOverlay")
  if (loader) {
    loader.remove()
  }
}

// OTP input handling
function setupOTPInputs() {
  const otpInputs = document.querySelectorAll(".otp-digit")

  otpInputs.forEach((input, index) => {
    input.addEventListener("input", (e) => {
      if (e.target.value.length === 1 && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus()
      }
    })

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && e.target.value === "" && index > 0) {
        otpInputs[index - 1].focus()
      }
    })
  })
}

function getOTPValue() {
  const otpInputs = document.querySelectorAll(".otp-digit")
  let otp = ""
  otpInputs.forEach((input) => {
    otp += input.value
  })
  return otp
}

// OTP Timer
function startOTPTimer() {
  let timeLeft = 120 // 2 minutes
  const timerElement = document.getElementById("timer")
  const resendButton = document.getElementById("resendOtp")

  const timer = setInterval(() => {
    const minutes = Math.floor(timeLeft / 60)
    const seconds = timeLeft % 60

    timerElement.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`

    if (timeLeft <= 0) {
      clearInterval(timer)
      resendButton.disabled = false
      resendButton.textContent = "পুনরায় OTP পাঠান"
    }

    timeLeft--
  }, 1000)
}

// Form toggle functions (these should already exist in your HTML)
function toggleForm(formType) {
  // Hide all sections
  const sections = [
    "loginSection",
    "emailCheckSection",
    "otpVerificationSection",
    "signupSection",
    "forgotPasswordSection",
    "resetPasswordSection",
  ]
  sections.forEach((section) => {
    const element = document.getElementById(section)
    if (element) {
      element.style.display = "none"
    }
  })

  // Show the requested section
  const targetSection = document.getElementById(formType + "Section")
  if (targetSection) {
    targetSection.style.display = "block"
  }
}

function openLoginPopup() {
  const popup = document.getElementById("loginPopup")
  if (popup) {
    popup.classList.add("active")
    toggleForm("login")
  }
}

function closeLoginPopup() {
  const popup = document.getElementById("loginPopup")
  if (popup) {
    popup.classList.remove("active")
  }
}

// Modal handlers
document.addEventListener("click", (e) => {
  if (e.target.id === "autoLoginButton") {
    document.getElementById("successModal").style.display = "none"
    closeLoginPopup()

    // Get user data and update UI
    const userData = JSON.parse(localStorage.getItem("userData"))
    if (userData) {
      updateUIAfterLogin(userData)
    }
  }

  if (e.target.id === "goToLoginButton") {
    document.getElementById("passwordResetSuccessModal").style.display = "none"
    toggleForm("login")
  }
})
