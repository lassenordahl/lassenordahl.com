---
path: "/projects/tippers-development"
date: "2019-05-04"
title: "TIPPERS"
---

# TIPPERS Development

## Overview

Throughout the last year of school, I've had a part-time job as a student developer for IoT research going on in UCI's CS department. 

> "TIPPERS is a system that manages IoT smart spaces by collecting sensor data, inferring semantically meaningful information from it, and offering such inferences to developers to create smart applications."

More information on TIPPERS can be found [here](http://tippersweb.ics.uci.edu/). Generally I describe TIPPERS as a large API focused on security and generality in the types of data to perform cool IoT functions on campus, homes, or even a navy ship.

My role has revolved around doing front-end development for the new applications, creating styling guidelines, and helping integrate authentication functionality in the system.

### TIPPERS Semantic IoT Poster

![https://user-images.githubusercontent.com/13127625/70859076-a7725c80-1ec2-11ea-9391-532ea984ea90.png](https://user-images.githubusercontent.com/13127625/70859076-a7725c80-1ec2-11ea-9391-532ea984ea90.png)

You can see my name at the bottom!

## Occupancy Application

Right now I'm working on a generalized occupancy application for the system. The goal of this is to showcase a lot of the data that the system collected over the summer of 2019. In the app, you can load onto a campus, building, or floor, and click through to deeper sub-levels, viewing occupancy data each level you go down. It's expected to utilize real-time data, with date ranges available if you wanted to see how an area looked a week ago for example.

Below is an older screenshot of the application, showing the global view of UCI's campus with the data that was available at that time.

### Global View

![https://user-images.githubusercontent.com/13127625/70858853-a50e0380-1ebe-11ea-82a0-c8837c72de16.png](https://user-images.githubusercontent.com/13127625/79298585-6309c400-7e96-11ea-842f-762aceccac8d.png)

Working on this application throughout the Fall of 2019 to the present has been one of the more challenging projects that I've taken on. TIPPERS as an API aims to be flexible, and thus the applications built upon it needs to focus less on the names of entities that record data (buildings, campuses, rooms) and more on the hierarchy of the entities. Theoretically you could show anything on this application provided it fits into one of the three categories for data types.

### Data Types

1. Geolocation types with geolocation sub types (Ex: UCI's Campus)
2. Geolocation types with non-geolocation sub types (Ex: Donald Bren Hall)
3. Non-geolocation types with non-geolocation sub types (Ex: Floor One of Donald Bren Hall)

What does this mean? Honestly I've been trying to figure this out myself. Throughout the last month we've generalized the types to the above three. This means you could load the application with a root type, and it would automatically load from there, with availability to click to deeper sub-levels. The best way to see this is to look through the pictures below.

### Detailed View

![https://user-images.githubusercontent.com/13127625/70858955-6d07c000-1ec0-11ea-852a-0377b9dc7b21.png](https://user-images.githubusercontent.com/13127625/93947596-fcb08980-fcf0-11ea-8e6d-765f4d571628.png)

### Floor View

![https://user-images.githubusercontent.com/13127625/70858961-8d377f00-1ec0-11ea-884b-cda6d6fedcf7.png](https://user-images.githubusercontent.com/13127625/93947702-426d5200-fcf1-11ea-9a90-993fef7f17d4.png)

Right now we're still in the stage of connecting everything, as some work needs to be done on the API's end before it can be linked up to the application. So far though, I think it's been an interesting architectural design challenge and helped me beef up my experience with React's context API.

### Tech Stack

- ReactJS
- React Rainbow Components
- Leaflet/React-Leaflet
- D3 (For the floor map)

## T-Portal

T-Portal was the project that I worked on Spring of 2019. It involved authenticating users using a central authentication system, letting users change their security settings, and adding new entity/data/observation types to the TIPPERS system. Challenges for this included deciding a lot of the architecture that went behind building an Authorization server. This was particularly difficult because we want users to be able to set up their own TIPPERS instances (API's and respective T-Portals), but authenticate themselves through one central server.

My partner Tristan Jogminas handled most of the really complicated OAuth stuff, and we worked together to build the base of the T-Portal that's being worked on today

### Redirected Authentication Page for TPortal

![https://user-images.githubusercontent.com/13127625/70859078-ac371080-1ec2-11ea-87a3-c52e4e923723.png](https://user-images.githubusercontent.com/13127625/70859078-ac371080-1ec2-11ea-87a3-c52e4e923723.png)

## Design Stuff

I've contributed to a lot of front-end design work with TIPPERS, which is great because practice makes perfect. Below is the TIPPERS style guideline, as well as the logo I designed for the system that's now used across a lot of it's marketing materials. I made a few of these throughout working at this job.

![https://user-images.githubusercontent.com/13127625/70859040-e227c500-1ec1-11ea-88b5-404027f41f6c.jpg](https://user-images.githubusercontent.com/13127625/70859040-e227c500-1ec1-11ea-88b5-404027f41f6c.jpg)