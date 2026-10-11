import mongoose from 'mongoose';
import { als } from './context.js';

/**
 * Database-per-business multi-tenancy.
 *
 * Each business has its own MongoDB database. Model files call defineModel(name, schema) and export the result.
 * That export behaves like a normal Mongoose model (Product.find(), new User(), ...), but each call is routed to
 * the model of the business in the current request context. Nothing else in the code base changes between a
 * single-business app and a multi-business one.
 */
const schemas = new Map();      // model name -> schema
const prepared = new Map();     // database name -> how many models are registered on it

export function tenantConnection(dbName) {
  const conn = mongoose.connection.useDb(dbName, { useCache: true });
  if (prepared.get(dbName) !== schemas.size) {
    for (const [name, schema] of schemas) if (!conn.models[name]) conn.model(name, schema);
    prepared.set(dbName, schemas.size);
  }
  return conn;
}

// Used when a business is created: registers models and builds indexes (unique usernames, receipt numbers, ...) up front
export async function prepareTenant(dbName) {
  const conn = tenantConnection(dbName);
  await Promise.all(Object.values(conn.models).map(m => m.init()));
  return conn;
}

export function defineModel(name, schema) {
  schemas.set(name, schema);
  const resolve = () => {
    const ctx = als.getStore();
    if (!ctx?.dbName) throw new Error(`No business selected: ${name} was used outside a business context`);
    return tenantConnection(ctx.dbName).models[name];
  };
  return new Proxy(function TenantModel() {}, {
    get(_t, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop === 'modelName') return name;
      const M = resolve();
      const v = M[prop];
      return typeof v === 'function' ? v.bind(M) : v;
    },
    construct(_t, args) { const M = resolve(); return new M(...args); },
  });
}
