import React, { useState } from "react"
import { graphql } from "gatsby"

// import 'rc-slider/assets/index.css';
// import Slider from 'rc-slider';
// import P5Wrapper from 'react-p5-wrapper';
// import sketch from './../sketches/sketch';

export default function Template({
  data, // this prop will be injected by the GraphQL query below.
}) {
  const { markdownRemark } = data // data.markdownRemark holds your post data
  const { frontmatter, html } = markdownRemark

  const [plantHealth, setPlantHealth] = useState(50);

  return (
    <div className="flex flex-col font-sans items-center min-h-screen text-gray-900 bg-main">
      <div className="flex flex-col w-4/5 lg:w-1/2 min-h-screen my-24">
          {/* { frontmatter.title === `Anteater Hydroponics` ?
            <div className="w-full flex flex-col items-center">
              <div className="center-plant">
                <P5Wrapper sketch={sketch(plantHealth)}></P5Wrapper>
              </div>
              <div className="w-4/5 py-16 flex flex-col items-center">
                <h3 className="text-2xl font-bold pb-8">Plant Health Slider</h3>
                <Slider max={100} min={0} onChange={(e) => setPlantHealth(e)} value={plantHealth}></Slider>
              </div>
            </div>
            : null
          } */}
        <div
          className="markdown"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

export const pageQuery = graphql`
  query($path: String!) {
    markdownRemark(frontmatter: { path: { eq: $path } }) {
      html
      frontmatter {
        date(formatString: "MMMM DD, YYYY")
        path
        title
      }
    }
  }
`