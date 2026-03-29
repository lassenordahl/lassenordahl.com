---
title: "Using Computer Vision to Create A More Accurate Digital Archive"
date: "2021-07-21"
thumbnail: "/images/blog/nyt-archive.webp"
originalUrl: "https://rd.nytimes.com/projects/using-computer-vision-to-create-a-more-accurate-digital-archive/"
---

In the early 2000s, The Times invested in digitizing its physical newspaper archive. Every issue of The New York Times going back to 1851 was scanned and made available through a public tool called Times Machine. In 2006, O.C.R. was applied to those scans to try to extract text from the images. We used the extracted text in our archival search index, but due to the poor quality of the existing O.C.R., it's not accurate enough to be reader-facing. We started this project to see how we could improve the quality of the text transcriptions from our archive and found that there were several promising ways to enhance the text transcription quality and recreate the structure of an article in a format similar to articles consumed digitally.

Modern O.C.R. techniques make use of convolutional neural networks and long short-term memory networks, along with models that try to recognize entire lines, to extract information based on the features of the words and surrounding text. These classes of neural networks are better suited for contextual information and sequences of data, two areas that are very helpful in text recognition.

Many of the issues with achieving human-parity text extraction from newspapers are specific to newspapers: print quality, layout, etc. Cloud-based O.C.R. services provided us high quality standard text recognition, but our team needed to develop new techniques specific to the challenges of newspaper archives. We implemented a number of procedures to enhance the quality of the newspaper scans and understand the differences between headlines, columns, paragraphs and photos. For example, we created logic to handle merging paragraphs split across columns and across pages to remove text like "Continued on Page A7," which isn't important when reading an article online.

An important element of post-processing is ensuring that the information we've extracted is as close to identical to the original scan as possible. This means that we can't make liberal use of spell-checking and grammar correction as we process the data, as it could alter the original contents of the article. Overall, we have reduced text transcription errors for our use case by 50% and have achieved greater than 95% overall word accuracy compared to previous O.C.R. efforts. With this new dataset, not only can we improve products like search and publish articles as web-native text in the future, but we can open up new research possibilities for others who would benefit from a high-quality newspaper text archive going back to 1851.

Special thanks to the Search, Archives, and Taxonomy team for an incredible amount of help in navigating the data and the infrastructure built around it.
