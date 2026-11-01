import { createPointkit } from './index.js';
export const pointkit = typeof document === 'undefined' ? null : createPointkit();
