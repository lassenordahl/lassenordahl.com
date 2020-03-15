import React from "react";

import Layout from "../components/layout";
import SEO from "../components/seo";
import Template from "../templates/projectTemplate";
import catAndHumanIllustration from "../images/cat-and-human-illustration.svg";

import { Link } from "gatsby";

import resume from "./../assets/lassenordahl_resume.pdf";

const projects = [
  {
    path: `projects/anteater-hydroponics`,
    title: `Anteater Hydroponics`,
    description: `IoT Plant Monitoring Application`,
    imgUrl: `https://user-images.githubusercontent.com/13127625/70379600-92eefc80-18e3-11ea-8891-d19285089f47.png`
  },
  {
    path: `projects/impulse`,
    title: `Impulse`,
    description: `Internship application management program using Gmail API's and NLP`,
    imgUrl: `https://user-images.githubusercontent.com/13127625/70756241-e51f8b80-1cf0-11ea-9ce1-a8d7354d97f8.png`
  },
  {
    path: `projects/hackuci`,
    title: `HackUCI Involvement`,
    description: `Developing websites for advertising Orange County's largest hackathon`,
    imgUrl: `https://user-images.githubusercontent.com/13127625/70756428-5e1ee300-1cf1-11ea-8959-f740b651b14e.png`
  }
]

const projectsTwo = [
  {
    path: `projects/tippers-development`,
    title: `TIPPERS Applications`,
    description: `Assisting research in the UCI IoT Department`,
    imgUrl: `https://user-images.githubusercontent.com/13127625/70756473-84448300-1cf1-11ea-9a75-ac78731a35a2.png`
  },
  {
    path: `projects/pxl`,
    title: `PXL`,
    description: `LED Matrix map for concerts using smartphones`,
    imgUrl: `https://user-images.githubusercontent.com/13127625/70756395-46dff580-1cf1-11ea-97a1-3c3bd1777f5d.png`
  },
  {
    path: `projects/orhx`,
    title: `ORHX`,
    description: `Oak Ridge Hacks, my first web development project`,
    imgUrl: `https://user-images.githubusercontent.com/13127625/70867193-9576d500-1f27-11ea-9915-e9f744c28cbc.png`
  }
]

const image_links = [
  `https://user-images.githubusercontent.com/13127625/70670532-14b98f80-1c2e-11ea-92b4-b022e0de8b8e.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670685-9d383000-1c2e-11ea-9a64-d2b74d57b5e9.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670713-ade8a600-1c2e-11ea-85ed-53b0de299d21.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670727-bb9e2b80-1c2e-11ea-8b49-358e9e5c4d8c.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670742-ceb0fb80-1c2e-11ea-8f5f-98da07cc22de.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670759-d8d2fa00-1c2e-11ea-9607-bc625e2221d2.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670777-e2f4f880-1c2e-11ea-9ffd-f618520f4c52.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670999-88a86780-1c2f-11ea-89a0-b1c97892cc25.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670997-86460d80-1c2f-11ea-9a2f-f0e1161589d5.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670993-847c4a00-1c2f-11ea-84e2-67b0aa3247ed.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670989-82b28680-1c2f-11ea-8104-f74416f7d45b.jpg`,
  `https://user-images.githubusercontent.com/13127625/70670985-80e8c300-1c2f-11ea-8dbe-1871cba71a52.jpg`,
  `https://user-images.githubusercontent.com/13127625/70671156-e6d54a80-1c2f-11ea-9baf-6b4fb8202d89.jpg`,
  `https://user-images.githubusercontent.com/13127625/70671157-e8067780-1c2f-11ea-98a8-42e4d692a239.jpg`
]

function IndexPage() {
  return (
    <Layout>
      <SEO
        keywords={[`Lasse`, `Nordahl`, `Lasse Nordahl`, `tailwindcss`]}
        title="Home"
      />
      <section>
        {/* <h1 className="text-5xl font-bold my-8"> */}
        <h2>
          About Me 📓
        </h2>
        <p>
          I'm Lasse Nordahl, a senior attending UC Irvine pursuing a B.S. in Computer Science. After a few internships and fun side projects, I've started to specialize in full-stack development focused on Web Design. In my free time I'm either rock climbing, exploring LA, drawing corgis on work resources, or doing photography. Feel free to explore the site to learn more about me.
          {/* I'm Lasse Nordahl, a rising Junior attending UC Irvine pursuing a B.S. in Computer Science with a specialization in Intelligent Systems. My expertise lies in full stack development and I intend on developing my education in Machine Learning/Artificial Intelligence. */}
        </p>
      </section>
      <section>
        <h2>
          Resume 📝
        </h2>
        <p>
          Below is my up-to-date resume focused on my biggest projects and most prominant work experience.
        </p>
        <div className="flex flex-col items-center justify-center w-full h-24">
            <a href="https://drive.google.com/file/d/10Tn5dYbFRafcYeFxl37C5aZIPWeXvPwf/view?usp=sharing" target="_blank">
              <button className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 border border-gray-400 rounded shadow">
                🧻 &nbsp; Resume Link
              </button>
            </a>
            
        </div>
      </section>
      <section>
        <h2>
          Experience 💈
        </h2>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between">
          <h3 className="text-2xl font-bold mt-0 mb-0">
            Beyond Limits &nbsp;🚀
          </h3>
          <h4 className="italic text-grey1 my-0 md:mb-1">
            January 2019 - Present
          </h4>
        </div>
        <h3 className="italic my-0 mb-6">
          Software Engineering Intern 
        </h3>
        <ul className="list-disc pl-8">
          <li>
            Developed features on an autonomous robotics project utilizing computer vision for corrosion detection.
          </li>
          <li>
            Integrated robotics framework and Web-GUI to display progress alerts, lidar streams, and video feeds.
          </li>
          <li>
            Built full-stack configuration tool that manages the setting of environment variables and mapping data to improve testing workflow.
          </li>
        </ul>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between">
          <h3 className="text-2xl font-bold mt-6 mb-0">
            IoT Research at UC Irvine &nbsp;🐜 🍴
          </h3>
          <h4 className="italic text-grey1 my-0 md:mb-1">
            January 2019 - Present
          </h4>
        </div>
        <h3 className="italic my-0 mb-6 mt-0">
          Software Engineering Intern
        </h3>
        <ul className="list-disc pl-8">
          <li>
            Currently designing and developing IoT applications for the TIPPERS research team at UCI.
          </li>
          <li>
            Responsibilities include wire-framing and building user interfaces, improving information security through OAuth, and contributing to larger architecture design between IoT APIs and their applications.
          </li>
        </ul>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between">
          <h3 className="text-2xl font-bold mt-6 mb-0">
            Intel &nbsp;💻
          </h3>
          <h4 className="italic text-grey1 my-0 md:mb-1">
            February 2018 - September 2019
          </h4>
        </div>
        <h3 className="italic my-0 mb-6 mt-0">
          Software Engineering Intern
        </h3>
        <ul className="list-disc pl-8">
          <li>
            Developed modules and implemented features within an internal test-automation codebase using AngularJS and Flask.
          </li>
          <li>
            Redesigned and optimized data visualization tools resulting in faster loading times and a significantly improved user experience.
          </li>
          <li>
            Oversaw and mentored a team of three interns, managing work distribution to meet quarterly deadlines.
          </li>
        </ul>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between">
          <h3 className="text-2xl font-bold mt-6 mb-0">
            Intel &nbsp;💻
          </h3>
          <h4 className="italic text-grey1 my-0 md:mb-1">
            June 2017 - February 2018
          </h4>
        </div>
        <h3 className="italic my-0 mb-6 mt-0">
          Software Engineering Intern 
        </h3>
        <ul className="list-disc pl-8">
          <li>
            Architected and deployed an AngularJS web application that handled requesting and scheduling of memory product tests for 200+ employees.
          </li>
          <li>
            Implemented real-time and historical data visualization of equipment efficiency to maximize equipment utilization using D3.
          </li>
          <li>
            Platform streamlined test scheduling and communication resulting in accelerated roadmap completion.
          </li>
        </ul>

      </section>
      <section>
        <h2>
          Projects 🧗
        </h2>
        <div className="flex flex-col lg:flex-row xl:flex-row sm:flex-col xs:flex-col md:flex-col">
          <div className="lg:w-1/2 xl:w-1/2">
            { projects.map(function(project) {
                return (
                  <Link to={project.path}>
                    <div className="shadow-xl hover:shadow-2xl w-full mh-card mb-16">
                    <img alt={1} className="w-full" src={project.imgUrl}></img>
                    <div className="p-8">
                      <h3 className="my-0 font-bold">
                        {project.title}
                      </h3>
                      <p className="mb-0">
                        {project.description}
                      </p>
                    </div>
                    </div>
                  </Link>
                );
              })
            }
          </div>
          <div className="xs:w-0 sm:w-0 md:w-0 lg:w-16 xl:w-16"/>
          <div className="lg:w-1/2 xl:w-1/2">
          { projectsTwo.map(function(project) {
              return (
                <Link to={project.path}>
                  <div className="shadow-xl hover:shadow-2xl w-full mh-card mb-16">
                  <img alt={1} className="w-full" src={project.imgUrl}></img>
                  <div className="p-8">
                    <h3 className="my-0 font-bold">
                      {project.title}
                    </h3>
                    <p className="mb-0">
                      {project.description}
                    </p>
                  </div>
                  </div>
                </Link>
              );
            })
          }
          </div>
        </div>
        {/* <div className="flex flex-wrap">
          {projects.map(function(project) {
            return (
              <div className="my-8 px-8 w-full xs:w-full sm:w-full md:w-full lg:w-1/2 xl:w-1/2">
                <Link to={project.path}>
                  <div className="shadow-xl hover:shadow-2xl w-full mh-card">
                    <img alt={1} className="w-full" src={project.imgUrl}></img>
                    <div className="p-8">
                      <h3 className="text-2xl font-bold">
                        {project.title}
                      </h3>
                      <p className="">
                        {project.description}
                      </p>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div> */}
      </section>
      <section>
        <h2>
          Photography 📷
        </h2>
        <p>
          In my free time I do some photography to capture memories, spend some time outdoors, and see some pretty colors. Below are some of my favorite photos from the last few months.
        </p>
        <div className="px-8">
          {image_links.map(function(link, index) {
            return (
              <img alt={`photo` + index} className="my-16" src={link}></img>
            );
          })}
        </div>
      </section>
    </Layout>
  );
}

export default IndexPage;
