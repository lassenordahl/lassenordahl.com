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
      <div className="flex flex-wrap items-center justify-between mx-auto pt-20">
        <div className="w-full flex flex-col-reverse lg:flex-row justify-between content-between">
          <div className="mr-0 items-center my-8 flex flex-col lg:items-start justify-center lg:mt-0">
            <h1 className="text-4xl sm:text-5xl my-0 font-bold">
              Lasse Nordahl
            </h1>
            <h4 className="text-xl sm:text-2xl my-0 text-grey1">
              Software Engineering Intern
            </h4>
            <h4 className="text-xl sm:text-2xl my-0 text-grey1">
              Northern California
            </h4>
            <div className="my-0 flex flex-row text-2xl">
              <a href="mailto:lnordahl@uci.edu">
                <i class="far fa-envelope m-4 hover:text-grey1"></i>
              </a>
              <a href="http://github.com/LasseNordahl" target="_blank">
                <i className="fab fa-github m-4 hover:text-grey1" href=""></i>
              </a>
              <a href="http://linkedin.com/in/lassenordahl" target="_blank">
                <i className="fab fa-linkedin m-4 hover:text-grey1"></i>
              </a>
              <a href="https://www.instagram.com/lassenordahl/" target="_blank">
                <i className="fab fa-instagram m-4 hover:text-grey1"></i>
              </a>
            </div>
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
