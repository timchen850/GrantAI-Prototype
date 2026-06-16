import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './lib/toast'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
)
