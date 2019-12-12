// See https://tailwindcss.com/docs/configuration for details

module.exports = {
  theme: {
    colors: {
      grey: `#bababa`
    },
    minHeight: {
      card: `480px`
    },
    fontFamily: {
      'sans': [`Helvetica Neue`, `Roboto`, `Arial`]
    },
    backgroundColor: theme => ({
      ...theme(`colors`),
      'main': `#ffffff`
    })
  },
  variants: {},
  plugins: []
};
