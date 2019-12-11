import { graphql, useStaticQuery, Link } from "gatsby";
import React, { useState } from "react";

import profile from './../images/profile.jpg';

function Header() {
  const [isExpanded, toggleExpansion] = useState(false);
  const { site } = useStaticQuery(graphql`
    query SiteTitleQuery {
      site {
        siteMetadata {
          title
        }
      }
    }
  `);

  return (
    <header>
      <div className="flex flex-wrap items-center justify-between mx-auto p-8">
        <div className="w-full px-8 py-8 flex justify-between content-between">
          <div className="mr-auto">
            <h1 className="text-6xl">
              Lasse Nordahl
            </h1>
            <h3 className="text-3xl">
              Software Engineering Intern
            </h3>
          </div>
          <img alt="" className="block w-40 rounded-full"  src={profile}></img>
        </div>
       
      </div>
    </header>
  );
}

export default Header;
