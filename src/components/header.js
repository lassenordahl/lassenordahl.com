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
      <div className="flex flex-wrap items-center justify-between mx-auto p-16">
        <div className="w-full flex justify-between content-between">
          <div className="mr-auto flex flex-col items-start justify-center">
            <h1 className="text-6xl my-0 font-bold">
              Lasse Nordahl
            </h1>
            <h3 className="text-3xl my-0 text-grey">
              Software Engineering Intern
            </h3>
            <h4 className="text-2xl my-4 text-grey">
              Greater Los Angeles
            </h4>
            {/* 💻  */}
          </div>
          <div className="m-auto flex items-center justify-center">
            <img alt="" className="block w-64 rounded-full"  src={profile}></img>
          </div>
        </div>
       
      </div>
    </header>
  );
}

export default Header;
