import './dark-academia.css';
import './cyberpunk.css';
import './parchment.css';
import './cosmic.css';
import './noir.css';
import './nordic.css';
import './glassmorphism.css';
import './retro-futurism.css';
import './art-deco.css';

export const themes = [
  { id: 'default', name: 'Default', className: '' },
  { id: 'dark-academia', name: 'Dark Academia', className: 'theme-dark-academia' },
  { id: 'cyberpunk', name: 'Cyberpunk', className: 'theme-cyberpunk' },
  { id: 'parchment', name: 'Parchment', className: 'theme-parchment' },
  { id: 'cosmic', name: 'Cosmic', className: 'theme-cosmic' },
  { id: 'noir', name: 'Noir', className: 'theme-noir' },
  { id: 'nordic', name: 'Nordic', className: 'theme-nordic' },
  { id: 'glassmorphism', name: 'Glassmorphism', className: 'theme-glassmorphism' },
  { id: 'retro-futurism', name: 'Retro Futurism', className: 'theme-retro-futurism' },
  { id: 'art-deco', name: 'Art Deco', className: 'theme-art-deco' },
] as const;

export type ThemeId = typeof themes[number]['id'];
