import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAdmin, requireStudent, type AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';

describe('Authentication and Role Isolation', () => {
  it('requireAdmin accepts tokens with admin role and attaches admin to request', () => {
    const token = jwt.sign({ email: 'admin@college.edu', role: 'admin' }, config.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as AuthRequest;
    let nextCalled = false;
    let errorPassed: unknown = null;

    requireAdmin(req, {} as any, (err?: unknown) => {
      if (err) errorPassed = err;
      else nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(errorPassed).toBeNull();
    expect(req.admin?.email).toBe('admin@college.edu');
  });

  it('requireAdmin rejects student tokens with 403', () => {
    const studentToken = jwt.sign({ role: 'student', student_id: 'STU048' }, config.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${studentToken}` } } as unknown as AuthRequest;
    let errorPassed: any = null;

    requireAdmin(req, {} as any, (err?: unknown) => {
      errorPassed = err;
    });

    expect(errorPassed).toBeDefined();
    expect(errorPassed?.status).toBe(403);
  });

  it('requireStudent accepts valid alphanumeric student token', () => {
    const studentToken = jwt.sign({ role: 'student', student_id: 'STU048' }, config.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${studentToken}` } } as unknown as AuthRequest;
    let nextCalled = false;

    requireStudent(req, {} as any, (err?: unknown) => {
      if (!err) nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.student?.student_id).toBe('STU048');
  });

  it('requireStudent accepts numeric student token', () => {
    const studentToken = jwt.sign({ role: 'student', student_id: 1001 }, config.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${studentToken}` } } as unknown as AuthRequest;
    let nextCalled = false;

    requireStudent(req, {} as any, (err?: unknown) => {
      if (!err) nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.student?.student_id).toBe(1001);
  });

  it('requireStudent rejects admin tokens from student endpoints', () => {
    const adminToken = jwt.sign({ email: 'admin@college.edu', role: 'admin' }, config.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${adminToken}` } } as unknown as AuthRequest;
    let errorPassed: any = null;

    requireStudent(req, {} as any, (err?: unknown) => {
      errorPassed = err;
    });

    expect(errorPassed).toBeDefined();
    expect(errorPassed?.status).toBe(401);
  });

  it('rejects expired or malformed tokens', () => {
    const req = { headers: { authorization: 'Bearer invalid.token.payload' } } as unknown as AuthRequest;
    let errorPassed: any = null;

    requireAdmin(req, {} as any, (err?: unknown) => {
      errorPassed = err;
    });

    expect(errorPassed).toBeDefined();
    expect(errorPassed?.status).toBe(401);
  });
});
