import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Room from './pages/Room.jsx';

// Router only. Pages assemble feature modules; no business logic lives here.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:id" element={<Room />} />
    </Routes>
  );
}
