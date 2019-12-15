---
path: "/projects/pxl"
date: "2019-05-04"
title: "PXL"
---

# PXL - Outside Hacks 2018

## Overview

PXL is a web application designed for mobile users all connected to a central backend that handles all image processing and pattern construction. Phones volunteer their current longitude and latitude and receive different colors to display based on their Geolocation data. Events are constructed with predetermined regions to create a grid of colors that phones reside in. As users move around, the colors change to fit the set pattern.

PXL is intended to be extremely flexible in how patterns are calculated. Using either the grid or mathematical equations using long/lat data, almost anything can be shown across this collaborative screen. In our eyes PXL could be used with a series of API’s that change what patterns PXL shows to fit the venue and use cases of different events. Using an admin simulation panel, event owners can “test” their patterns using a simulation panel similar to the assets shown below.

### Homepage

![https://user-images.githubusercontent.com/13127625/70867086-277dde00-1f26-11ea-9b06-451f3cb20491.png](https://user-images.githubusercontent.com/13127625/70867086-277dde00-1f26-11ea-9b06-451f3cb20491.png)

## Collective Patterns

Flexibility was the name of the game with this project. The reason we loved the idea so much was the use cases are decided by the users. In our eyes we saw everybody being involved in creating something fun for everybody at the concert. Using resolution downscaling, images can be drawn across the entire event grid and math could be used to creatively manipulate color patterns across screens. One takeaway from this project is that app simplicity can result in complex, fun use cases that can help draw users in.

### Example Pattern

![https://user-images.githubusercontent.com/13127625/70867094-3d8b9e80-1f26-11ea-8397-e124de4865b6.png](https://user-images.githubusercontent.com/13127625/70867094-3d8b9e80-1f26-11ea-8397-e124de4865b6.png)

## Safety Alerts

One of the best parts of this hackathon was getting to play around with patterns and specific use cases for our app. Later in the evening we came across the idea of an alert pattern that helps people who need emergency services at an event. Using this configuration, any user can click send out an emergency alert using their mobile device. When an alert is sent out, the alerters region is marked, making all nearby devices flash red. All other regions are automatically set to black, resulting a map that immediately shows where first responders should move towards.

### Safety Alert Mockup

![https://user-images.githubusercontent.com/13127625/70867096-3f556200-1f26-11ea-8f30-b8695d6355ff.png](https://user-images.githubusercontent.com/13127625/70867096-3f556200-1f26-11ea-8f30-b8695d6355ff.png)

## Tech Stack

- ReactJS
- MaterialUI
- Firebase