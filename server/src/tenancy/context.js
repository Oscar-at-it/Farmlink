import { AsyncLocalStorage } from 'node:async_hooks';

// Every request runs inside a "business context". All tenant models read the database name from here,
// so route code never needs to know which business it is serving.
export const als = new AsyncLocalStorage();
export const runWithTenant = (ctx, fn) => als.run(ctx, fn);
export const currentTenant = () => als.getStore();
export const ctxOf = business => ({ dbName: business.dbName, businessId: String(business._id) });
