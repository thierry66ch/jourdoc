import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles/global.css'
import './i18n'
import Login from './pages/Login'
import Portal from './pages/Portal'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import JourDocApp from './pages/jourdoc/JourDocApp'
import JourDocJournal from './pages/jourdoc/JourDocJournal'
import NoteForm from './pages/jourdoc/NoteForm'
import ObjetDetail from './pages/jourdoc/ObjetDetail'
import ThemeDetail from './pages/jourdoc/ThemeDetail'
import ObjetManager from './pages/jourdoc/ObjetManager'
import ThemeManager from './pages/jourdoc/ThemeManager'
import MediaGallery from './pages/jourdoc/MediaGallery'
import MediaDetail from './pages/jourdoc/MediaDetail'
import CalendarView from './pages/jourdoc/CalendarView'
import NoteView from './pages/jourdoc/NoteView'
import WorkspaceManager from './pages/jourdoc/WorkspaceManager'
import TodoistTasks from './pages/jourdoc/TodoistTasks'
import AnalyseView from './pages/jourdoc/AnalyseView'
import ElementManager from './pages/jourdoc/ElementManager'
import BibliothequeView from './pages/jourdoc/BibliothequeView'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ShareTarget from './pages/ShareTarget'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { adminToken } = useAuth()
  return adminToken ? children : <Navigate to="/admin/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/" element={<PrivateRoute><Portal /></PrivateRoute>} />
            <Route path="/share" element={<PrivateRoute><ShareTarget /></PrivateRoute>} />
            <Route path="/jourdoc/:wsId" element={<PrivateRoute><JourDocApp /></PrivateRoute>}>
              <Route index element={<JourDocJournal />} />
              <Route path="new" element={<NoteForm />} />
              <Route path="notes/:noteId" element={<NoteView />} />
              <Route path="notes/:noteId/edit" element={<NoteForm />} />
              <Route path="objet/:objetId" element={<ObjetDetail />} />
              <Route path="theme/:themeId" element={<ThemeDetail />} />
              <Route path="calendar" element={<CalendarView />} />
              <Route path="todoist-tasks" element={<TodoistTasks />} />
              <Route path="analyse" element={<AnalyseView />} />
              <Route path="elements" element={<ElementManager />} />
              <Route path="bibliotheque" element={<BibliothequeView />} />
              <Route path="settings" element={<WorkspaceManager />} />
              <Route path="medias" element={<MediaGallery />} />
              <Route path="media/:mediaId" element={<MediaDetail />} />
              <Route path="objets" element={<ObjetManager />} />
              <Route path="themes" element={<ThemeManager />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
)
