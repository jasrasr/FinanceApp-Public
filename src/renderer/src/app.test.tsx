import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './app';

describe('application shell', () => {
  it('renders the Debt Tracker title and placeholder home screen', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Debt Tracker' }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Application foundation' }),
    ).toBeVisible();
    expect(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeVisible();
  });
});
