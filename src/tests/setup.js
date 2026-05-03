// Only import jest-dom matchers when running in a browser-like environment
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom');
}
