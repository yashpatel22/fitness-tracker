import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './lib/appContext';
import { Shell } from './ui/Shell';
import { Loader } from './ui/common';
import './theme/theme.css';
import './styles/global.css';

const Today = lazy(() => import('./pages/Today').then((m) => ({ default: m.Today })));
const MySplit = lazy(() => import('./pages/MySplit').then((m) => ({ default: m.MySplit })));
const Library = lazy(() => import('./pages/Library').then((m) => ({ default: m.Library })));
const Session = lazy(() => import('./pages/Session').then((m) => ({ default: m.Session })));
const Progress = lazy(() => import('./pages/Progress').then((m) => ({ default: m.Progress })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })));
const DayPreview = lazy(() => import('./pages/DayPreview').then((m) => ({ default: m.DayPreview })));

export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Shell>
          <Suspense fallback={<Loader />}>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/plan" element={<MySplit />} />
              <Route path="/library" element={<Library />} />
              <Route path="/exercise/:exId" element={<ExerciseDetail />} />
              <Route path="/day/:dayId" element={<DayPreview />} />
              <Route path="/session/:id" element={<Session />} />
              <Route path="/history" element={<Navigate to="/progress" replace />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Shell>
      </HashRouter>
    </AppProvider>
  );
}
