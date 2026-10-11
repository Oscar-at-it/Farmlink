// validate(schema, 'body' | 'query') -> replaces req[part] with parsed data
export const validate = (schema, part = 'body') => (req, _res, next) => {
  try { req[part] = schema.parse(req[part]); next(); } catch (e) { next(e); }
};
