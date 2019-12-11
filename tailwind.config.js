// See https://tailwindcss.com/docs/configuration for details

module.exports = {
  theme: {
    fontFamily: {
      'sans': [`Helvetica Neue`, `Roboto`, `Arial`]
    },
    backgroundColor: theme => ({
      ...theme(`colors`),
      'main': `#f7f7f7`
    })
  },
  variants: {},
  plugins: []
};
