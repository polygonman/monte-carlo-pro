// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('recharts', () => import('../__mocks__/recharts.jsx'));
import MonteCarloSimulator from '../MonteCarloSimulator.jsx';

describe('MonteCarloSimulator component', () => {
  it('renders without crashing', () => {
    render(<MonteCarloSimulator />);
    expect(screen.getByText('Monte Carlo Simulator')).toBeInTheDocument();
  });

  it('shows empty-state prompt before running simulation', () => {
    render(<MonteCarloSimulator />);
    expect(screen.getByText('พร้อมเริ่มการจำลอง')).toBeInTheDocument();
  });

  it('renders all main input sections', () => {
    render(<MonteCarloSimulator />);
    expect(screen.getByText('ข้อมูลส่วนตัว')).toBeInTheDocument();
    expect(screen.getByText('เงินและกระแสเงินสด')).toBeInTheDocument();
    expect(screen.getByText('สมมติฐานตลาด')).toBeInTheDocument();
  });

  it('run button is present and enabled', () => {
    render(<MonteCarloSimulator />);
    const btn = screen.getByRole('button', { name: /รัน Simulation/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('shows success rate card after running simulation', async () => {
    render(<MonteCarloSimulator />);
    const btn = screen.getByRole('button', { name: /รัน Simulation/i });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText('โอกาสสำเร็จตามแผน')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('shows percentile chart after running simulation', async () => {
    render(<MonteCarloSimulator />);
    fireEvent.click(screen.getByRole('button', { name: /รัน Simulation/i }));
    await waitFor(() => {
      expect(screen.getByText('เส้นทางความมั่งคั่งตามอายุ')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('shows distribution histogram after running simulation', async () => {
    render(<MonteCarloSimulator />);
    fireEvent.click(screen.getByRole('button', { name: /รัน Simulation/i }));
    await waitFor(() => {
      expect(screen.getByText(/การกระจายของเงินคงเหลือ/)).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('input changes are reflected in the field', () => {
    render(<MonteCarloSimulator />);
    const inputs = document.querySelectorAll('input[type="number"]');
    // First input is currentAge
    fireEvent.change(inputs[0], { target: { value: '40' } });
    expect(inputs[0].value).toBe('40');
  });

  it('life shocks section is present', () => {
    render(<MonteCarloSimulator />);
    expect(screen.getAllByText(/เหตุการณ์ไม่คาดฝัน/i).length).toBeGreaterThan(0);
  });

  it('tax section is present', () => {
    render(<MonteCarloSimulator />);
    // Section heading is exactly "ภาษี"
    const matches = screen.getAllByText(/^ภาษี$/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('pension section is present', () => {
    render(<MonteCarloSimulator />);
    expect(screen.getByText(/บำนาญ \/ รายได้เสริม/)).toBeInTheDocument();
  });
});
