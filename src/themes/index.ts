import './dark-academia.css';
import './cyberpunk.css';
import './parchment.css';
import './cosmic.css';
import './noir.css';
import './nordic.css';
import './glassmorphism.css';
import './film-grain.css';
import './verdant-grove.css';
import './art-deco.css';
import './knolling.css';
import './industrial.css';
import './streamline-moderne.css';
import './pixel-art.css';

export const themes = [
  { id: 'default', name: 'Default', className: '', accent: '#6366f1', font: 'system-ui, sans-serif', bg: '#ffffff' },
  { id: 'dark-academia', name: 'Dark Academia', className: 'theme-dark-academia', accent: '#b8860b', font: "'Cormorant Garamond', serif", bg: '#2a1a0a' },
  { id: 'cyberpunk', name: 'Cyberpunk', className: 'theme-cyberpunk', accent: '#05d9e8', font: "'Orbitron', sans-serif", bg: '#0a0a0f' },
  { id: 'parchment', name: 'Parchment', className: 'theme-parchment', accent: '#c53a27', font: "'Cinzel', serif", bg: '#e8d5a3' },
  { id: 'cosmic', name: 'Cosmic', className: 'theme-cosmic', accent: '#40e0d0', font: "'Cormorant Garamond', serif", bg: '#030108' },
  { id: 'noir', name: 'Noir', className: 'theme-noir', accent: '#ff6b35', font: "'Playfair Display', serif", bg: '#0a0a0a' },
  { id: 'nordic', name: 'Nordic', className: 'theme-nordic', accent: '#c67b5c', font: "'Playfair Display', serif", bg: '#fafbfc' },
  { id: 'glassmorphism', name: 'Glassmorphism', className: 'theme-glassmorphism', accent: '#667eea', font: "'Inter', sans-serif", bg: '#0f0c29' },
  { id: 'film-grain', name: 'Film Grain', className: 'theme-film-grain', accent: '#d4a066', font: "'Special Elite', monospace", bg: '#faf6ed' },
  { id: 'verdant-grove', name: 'Verdant Grove', className: 'theme-verdant-grove', accent: '#4f8a6e', font: "'Cormorant Garamond', serif", bg: '#f4f8f3' },
  { id: 'art-deco', name: 'Art Deco', className: 'theme-art-deco', accent: '#d4af37', font: "'Poiret One', cursive", bg: '#0d0d0d' },
  { id: 'knolling', name: 'Knolling', className: 'theme-knolling', accent: '#c4572a', font: "'IBM Plex Sans', sans-serif", bg: '#fafaf8' },
  { id: 'industrial', name: 'Industrial', className: 'theme-industrial', accent: '#ffb800', font: "'Oswald', sans-serif", bg: '#1a1d1f' },
  { id: 'streamline-moderne', name: 'Streamline Moderne', className: 'theme-streamline-moderne', accent: '#7ebdb4', font: "'Quicksand', sans-serif", bg: '#0f1a2e' },
  { id: 'pixel-art', name: 'Pixel Art', className: 'theme-pixel-art', accent: '#00d4ff', font: "'Press Start 2P', monospace", bg: '#1a1a2e' },
] as const;

export type ThemeId = typeof themes[number]['id'];
