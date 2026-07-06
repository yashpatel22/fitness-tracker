import React from 'react';
import { NavLink } from 'react-router-dom';
import { IconHome, IconCalendar, IconBarbell, IconChart, IconUser, IconDumbbell } from './icons';

const TABS = [
  { to: '/', label: 'Home', icon: IconHome, tel: 'nav-today', end: true },
  { to: '/plan', label: 'Presets', icon: IconCalendar, tel: 'nav-plan' },
  { to: '/library', label: 'Library', icon: IconBarbell, tel: 'nav-library' },
  { to: '/progress', label: 'Progress', icon: IconChart, tel: 'nav-progress' },
  { to: '/profile', label: 'Profile', icon: IconUser, tel: 'nav-profile' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="appbar">
        <div className="brand"><span className="brand-mark"><IconDumbbell size={16} /></span> Fitness</div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="tabbar">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
              data-telemetry-name={t.tel}>
              <Icon size={23} />
              <span>{t.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
