import * as migration_20260202_203210_initial_setup from './20260202_203210_initial_setup';

export const migrations = [
  {
    up: migration_20260202_203210_initial_setup.up,
    down: migration_20260202_203210_initial_setup.down,
    name: '20260202_203210_initial_setup'
  },
];
