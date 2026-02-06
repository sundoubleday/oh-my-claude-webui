import { describe, it, expect } from 'vitest'
import app from '../index'

describe('Health Endpoint', () => {
  it('should return ok status', async () => {
    const req = new Request('http://localhost:5757/health')
    const res = await app.fetch(req)
    const json = await res.json()
    
    expect(res.status).toBe(200)
    expect(json).toEqual({ status: 'ok' })
  })
})
