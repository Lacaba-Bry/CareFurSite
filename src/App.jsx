import { Routes, Route } from 'react-router-dom'
import PublicHome from './pages/PublicHome'
import StaffInquiries from './pages/StaffInquiries'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/staff-inquiries" element={<StaffInquiries />} />
    </Routes>
  )
}
