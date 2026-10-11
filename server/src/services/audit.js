import AuditLog from '../models/AuditLog.js';
export const audit = (user, action, entity, entityId, details) =>
  AuditLog.create({ user: user?._id, action, entity, entityId, details }).catch(() => {});
