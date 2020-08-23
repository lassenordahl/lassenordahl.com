// See https://tailwindcss.com/docs/configuration for details

module.exports = {
  important: true,
  theme: {
    colors: {
      'grey1': `#9c9c9c`,
      'grey2': `#bababa`,
    },
    minHeight: {
      card: `480px`
    },
    fontFamily: {
      'sans': [`Open Sans`, `Roboto`, `Arial`]
    },
    backgroundColor: theme => ({
      ...theme(`colors`),
      'main': `#ffffff`
    })
  },
  variants: {},
  plugins: []
};
