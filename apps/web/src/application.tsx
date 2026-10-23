import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout';
import { AuthPage } from '@/pages/auth-page';
import { GardenPage } from '@/pages/garden-page';
import { PlantPage } from '@/pages/plant-page';
import { SettingsPage } from '@/pages/settings-page';
import { StatisticsPage } from '@/pages/statistics-page';
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<AuthPage register />} />
      <Route element={<AppLayout />}>
        <Route index element={<GardenPage />} />
        <Route path="/plants" element={<GardenPage collection />} />
        <Route path="/plants/:id" element={<PlantPage />} />
        <Route path="/statistics" element={<StatisticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
