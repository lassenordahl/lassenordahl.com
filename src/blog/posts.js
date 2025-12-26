// Blog posts registry
// Posts are sorted by date (newest first) when rendered

export const posts = [
  {
    slug: "download-zip",
    title: "download.zip",
    date: "2023-03-27",
    thumbnail: "/images/blog/download-zip.png",
    originalUrl: "http://www.download.zip/"
  },
  {
    slug: "google-new-tlds",
    title: "8 new top-level domains for dads, grads and techies",
    date: "2023-05-10",
    thumbnail: "/images/blog/google-tlds.png",
    originalUrl: "https://blog.google/products/registry/8-new-top-level-domains-for-dads-grads-tech/",
    content: `
May is also the month of Google I/O, our annual developer conference. .foo, .zip, .mov and .nexus are perfect whether you're learning to code, deploying a helpful tool, building your portfolio, or starting a new community. Check out some of the websites already using these TLDs:

- **gamers.nexus**: Review computer hardware and plan your next gaming PC
- **helloworld.foo**: Learn how to code "hello world" in each programming language
- **url.zip**: Create short, powerful and trackable links
- <mark>**david.mov**: Watch videos by David Imel in this liminal space</mark>

Starting today, you can register all of these new extensions as part of our Early Access Program for an additional one-time fee. This fee decreases according to a daily schedule through the end of May 10. On May 10 at 16:00 UTC, all of these domains will be publicly available at a base annual price through your registrar of choice. To make it super easy for anyone to get their website live, we've worked with Google Sites to launch new templates for graduates, professors and parents.

To learn more about pricing and our participating partners, visit registry.google.
    `.trim()
  },
  {
    slug: "nyt-computer-vision-archive",
    title: "Using Computer Vision to Create A More Accurate Digital Archive",
    date: "2021-07-21",
    thumbnail: "/images/blog/nyt-archive.jpg",
    originalUrl: "https://rd.nytimes.com/projects/using-computer-vision-to-create-a-more-accurate-digital-archive/",
    content: `
In the early 2000s, The Times invested in digitizing its physical newspaper archive. Every issue of The New York Times going back to 1851 was scanned and made available through a public tool called Times Machine. In 2006, O.C.R. was applied to those scans to try to extract text from the images. We used the extracted text in our archival search index, but due to the poor quality of the existing O.C.R., it's not accurate enough to be reader-facing. We started this project to see how we could improve the quality of the text transcriptions from our archive and found that there were several promising ways to enhance the text transcription quality and recreate the structure of an article in a format similar to articles consumed digitally.

Modern O.C.R. techniques make use of convolutional neural networks and long short-term memory networks, along with models that try to recognize entire lines, to extract information based on the features of the words and surrounding text. These classes of neural networks are better suited for contextual information and sequences of data, two areas that are very helpful in text recognition.

Many of the issues with achieving human-parity text extraction from newspapers are specific to newspapers: print quality, layout, etc. Cloud-based O.C.R. services provided us high quality standard text recognition, but our team needed to develop new techniques specific to the challenges of newspaper archives. We implemented a number of procedures to enhance the quality of the newspaper scans and understand the differences between headlines, columns, paragraphs and photos. For example, we created logic to handle merging paragraphs split across columns and across pages to remove text like "Continued on Page A7," which isn't important when reading an article online.

An important element of post-processing is ensuring that the information we've extracted is as close to identical to the original scan as possible. This means that we can't make liberal use of spell-checking and grammar correction as we process the data, as it could alter the original contents of the article. Overall, we have reduced text transcription errors for our use case by 50% and have achieved greater than 95% overall word accuracy compared to previous O.C.R. efforts. With this new dataset, not only can we improve products like search and publish articles as web-native text in the future, but we can open up new research possibilities for others who would benefit from a high-quality newspaper text archive going back to 1851.

Special thanks to the Search, Archives, and Taxonomy team for an incredible amount of help in navigating the data and the infrastructure built around it.
    `.trim()
  },
  {
    slug: "cockroachdb-sql-in-browser",
    title: "Executing SQL queries from the browser",
    date: "2023-11-09",
    thumbnail: "/images/blog/cockroach-browser.avif",
    originalUrl: "https://www.cockroachlabs.com/blog/cockroachdb-sql-in-browser/",
    content: `
Over the last couple weeks, you might have noticed a new tab on the cluster view of CockroachDB Cloud! We just released an open preview of our Browser SQL Shell, which allows writing queries on your database within seconds of cluster creation.

![SQL queries executing in browser](/images/blog/sql-shell-1.avif)

## Why we built it

While I'm not going to say all SQL should be executed from the browser, working with your database should have as little friction as possible. Iterating on schemas, testing syntax, and executing queries shouldn't require generating a user and saving a password when you're getting started. I'm sure we've all had stacks of notes storing way too many autogenerated strings for our database credentials.

With CockroachDB Cloud, you can create a multi-region serverless database in less than 30 seconds. Writing SQL queries should feel just as fast, and take advantage of the flexibility a web client has to make the experience better.

Internally, it's been nice to use it during schema development and validating data in clusters. These little bits of time add up! A shell helps us refocus on the parts of building an app.

## Syntax highlighting and UX with CockroachDB

The SQL shell isn't the first experience we've released with Syntax highlighting and SQL execution from the browser. Last year, we released our MOLT Schema Conversion Tool (SCT), which helps you iterate on DB schemas while converting it to CockroachDB. The SCT presents each statement with syntax highlighting to help reading table structures.

Our code inputs use Codemirror 6 under the hood, with a custom theme to add a little color to the text. Codemirror 6 hit a sweet spot with performance, bundle size, plugin support, with a lot of active support some great developers. Replit did a fairly large migration over the last 2 years and did an awesome deep dive into the benefits it brings. With this, it'll be a lot easier to add things like VIM keybindings and helpful cursor interactions down the line!

Codemirror also has great autocomplete support. When you open the shell, we make a query to pull your table schemas and column names to make writing queries a bit quicker. Just navigate the options and click enter to speed up the typing.

![Autocomplete in SQL shell](/images/blog/sql-shell-2.avif)

## Any other neat stuff?

The Browser SQL shell has some handy features to help database operations that build on the normal terminal experience. After trying a few variations we felt pretty inspired by Jupyter notebooks and terminals like Warp, which provide persistent queries that can be run in a long running view.

![Local sorting in SQL shell](/images/blog/sql-shell-3.avif)

While working across your DB, you can copy the query to share, navigate the history, export to CSVs, and view column types. Query results are rendered in tables to improve readability, and enables local sorting for quickly scanning through your data. Error formats will also reflect what you'd see with our terminal experience to reduce context switching between the two. Feel free to also use \`??\` syntax for hints when writing your queries.

![Hints](/images/blog/sql-shell-4.avif)

![SQL terminal hints](/images/blog/sql-shell-4-5.avif)

![SQL terminal in browser](/images/blog/sql-shell-5.avif)

We'll be iterating on the shell a fair bit over the next few months. If you have anything you'd like to see, feel free to share it with the feedback button on the page!

## FAQ

**What access level do I need?**

With our new roles system, Cluster Administrators have the ability to write queries from the browser. This is required since our console uses a provisioned SQL user under the hood, so only users with SQL access are permitted.

**Why don't I see the SQL Shell in the console?**

The SQL Shell is available for Cluster Administrators on Serverless and Dedicated standard clusters. Please check your permissions and cluster type within your organization.

**Where do I find it?**

Feel free to create any cluster in CockroachDB Cloud, and you'll see it under the "Overview" page.

**Is the SQL Shell general availability?**

We've opted to label it as Preview as we iterate on features and get feedback from customers, but it's available for all users with the correct permissions now!
    `.trim()
  }
];

// Helper to get posts sorted by date (newest first)
export function getSortedPosts() {
  return [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Helper to get a single post by slug
export function getPostBySlug(slug) {
  return posts.find(p => p.slug === slug);
}
