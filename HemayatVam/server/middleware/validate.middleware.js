export const validateBody = (schema) => (req, res, next) => {
  const { value, error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(422).json({
      message: 'خطا در اعتبارسنجی ورودی',
      errors: error.details.map((d) => d.message)
    });
  }
  req.body = value;
  next();
};
