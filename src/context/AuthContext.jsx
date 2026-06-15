import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('adminToken'))

  function login(jwt) {
    localStorage.setItem('token', jwt)
    setToken(jwt)
  }

  function logout() {
    localStorage.removeItem('token')
    setToken(null)
  }

  function adminLogin(jwt) {
    sessionStorage.setItem('adminToken', jwt)
    setAdminToken(jwt)
  }

  function adminLogout() {
    sessionStorage.removeItem('adminToken')
    setAdminToken(null)
  }

  return (
    <AuthContext.Provider value={{ token, login, logout, adminToken, adminLogin, adminLogout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
