import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // BDD-style output
    reporter: ['verbose', 'html'],
    
    // Environment
    environment: 'jsdom',
    
    // Setup files
    setupFiles: ['./__tests__/setup.ts'],
    
    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        '__tests__/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    },
    
    // Test file patterns
    include: [
      '__tests__/**/*.{test,spec}.{ts,tsx}',
      'apps/**/*.{test,spec}.{ts,tsx}'
    ],
    
    // Exclude
    exclude: [
      'node_modules',
      'dist',
      '.next',
      '**/*.d.ts'
    ],
    
    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Globals for cleaner tests
    globals: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/web'),
      '@server': path.resolve(__dirname, './apps/server')
    }
  }
})
