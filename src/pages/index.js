import React from "react";

import Layout from "../components/layout";
import SEO from "../components/seo";
import Template from "../templates/projectTemplate";
import catAndHumanIllustration from "../images/cat-and-human-illustration.svg";

function IndexPage() {
  return (
    <Layout>
      <SEO
        keywords={[`gatsby`, `tailwind`, `react`, `tailwindcss`]}
        title="Home"
      />
      <section>
      </section>
    </Layout>
  );
}

export default IndexPage;
