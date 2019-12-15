---
path: "/projects/impulse"
date: "2019-05-04"
title: "Impulse"
---

# Impulse - HackTech 2019

## Overview

This app ended up being pretty simple to build in terms of the front-end. I didn't get to do as much as I'd have liked because I spent the first half of the hackathon working on a react native app that we scrapped.

We ended up winning a best Design/UX award for this though! It was the first time I'd ever won anything for something I coded which was pretty cool.

## Inspiration

When we open our email, we see emails that originate from internship applications we filed months ago. Applications that we don't even remember. Attempting to track this type of work manually is exhausting as well. We wanted to fix this problem so we went out to build an app that automates this process for us and does all the heavy work load. Impulse allows users to easily access all their applications in a visually appealing setting and lists in chronological order of companies applied to, position applied for, content of the email, and stage of the application.

## **What it does**

Impulse uses Google's gmail API to authenticate with a person's email and it tracks which emails are from internship applications. It then loads these emails into a database where it shows information on each email, including company name, logo, status, content of the email, and the time line. Additionally, if a company sends another email, it overwrites the existing entry in the database to accurately reflect the new email and showcases the time line changes.

### Dashboard

![https://user-images.githubusercontent.com/13127625/70756241-e51f8b80-1cf0-11ea-9ce1-a8d7354d97f8.png](https://user-images.githubusercontent.com/13127625/70756241-e51f8b80-1cf0-11ea-9ce1-a8d7354d97f8.png)