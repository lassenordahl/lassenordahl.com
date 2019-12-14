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
      <div className="flex flex-wrap items-center justify-between mx-auto p-16 pt-20">
        <div className="w-full flex flex-col-reverse xs:flex-col-reverse sm:flex-col-reverse md:flex-col-reverse lg:flex-row justify-between content-between">
          <div className="mr-0 items-center mt-8 flex flex-col xs:items-center sm:items-center md:items-center lg:items-start justify-center lg:mt-0">
            <h1 className="text-5xl my-0 font-bold">
              Lasse Nordahl
            </h1>
            <h4 className="text-2xl my-0 text-grey1">
              Software Engineering Intern
            </h4>
            <h4 className="text-2xl my-0 text-grey1">
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
