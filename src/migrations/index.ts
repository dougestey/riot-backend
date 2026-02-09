import * as migration_20260202_203210_initial_setup from './20260202_203210_initial_setup';
import * as migration_20260203_135003 from './20260203_135003';

export const migrations = [
  {
    up: migration_20260202_203210_initial_setup.up,
    down: migration_20260202_203210_initial_setup.down,
    name: '20260202_203210_initial_setup',
  },
  {
    up: migration_20260203_135003.up,
    down: migration_20260203_135003.down,
    name: '20260203_135003'
  },
];
