import PropTypes from "prop-types";
import React from "react";

import Header from "./header";

function Layout({ children }) {
  return (
    <div className="flex flex-col font-sans items-center min-h-screen bg-main">
      <div className="flex flex-col lg:w-3/5 md:w-4/5 sm:w-4/5 min-h-screen">
        <Header />
        <main className="flex flex-col flex-1 mx-auto w-full px-16">
          {children}
        </main>

        <footer className="flex items-center justify-center">
          <div className="text-gray-700 px-8 py-8">
            <p>
              Made with ❤️ in Irvine, CA
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

Layout.propTypes = {
  children: PropTypes.node.isRequired
};

export default Layout;
