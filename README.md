# Problem Description

## Problem Overview

Electron Paramagnetic Resonance (EPR) spectroscopy is a powerful experimental technique, but in practice EPR data management and analysis workflows are fragmented, manual, and poorly reproducible. Data produced by Bruker spectrometers is typically stored as DSC/DTA files inside archives, processed locally using proprietary software, and shared as static images or PDFs without a clear link to the original data or processing parameters.

This project addresses the problem of importing, organizing, processing, visualizing, and reporting EPR spectra in a unified web application, with support for multiple experiment types and reproducible report generation. The system is designed for researchers who work with Bruker EPR data and need a structured, persistent, and auditable workflow that works across sessions and users.

The application supports both authenticated users with private data storage and a guest mode that allows quick, registration-free exploration of example and shared datasets.

---

## What the System Does

The system is a full-stack web application that allows users to:

- Upload EPR data archives produced by Bruker spectrometers
- Automatically parse and classify spectra by experiment type
- Organize spectra into samples based on archive structure and filename conventions
- Visualize spectra using experiment-specific viewers and processing options
- Select processed plots and assemble them into structured reports
- Export reproducible reports as PDF artifacts
- Persist data across sessions for registered users, or work in a shared guest workspace without registration

The application includes a frontend, backend, database, object storage, background processing, API contract, automated tests, containerization, and cloud deployment.

---

## Supported Data and Experiments

The system is designed around Bruker EPR data formats and currently supports:

- Standard DSC/DTA (BES3T) files inside ZIP archives

Supported experiment types include:

- CW EPR
- EDFS
- T1 relaxation
- T2 relaxation
- Rabi oscillations
- HYSCORE and other 2D experiments

Spectra are automatically classified based on file structure and filename tokens. 
---

## User Stories

### Guest User

- As a guest, I want to open the application without registration
- As a guest, I want to load an example dataset to explore the interface
- As a guest, I want to upload my own archive and visualize spectra
- As a guest, I understand that data is shared with other guest users and may not persist long-term

### Registered User

- As a registered user, I want to create an account and log in securely
- As a registered user, I want my uploaded spectra and reports to persist across sessions
- As a registered user, I want my data to be private and scoped to my account

### Data Import

- As a user, I want to upload a ZIP archive containing EPR data
- As a user, I want the system to parse the archive and show what samples and spectra were detected
- As a user, I want samples to be automatically named based on folder structure and filename prefixes

### Spectrum Analysis

- As a user, I want spectra to be grouped by experiment type
- As a user, I want to visualize 1D spectra with standard processing options such as normalization, baseline correction, and offsets
- As a user, I want a dedicated Rabi analysis view with time traces, FFT, frequency masking, and fitting
- As a user, I want to visualize 2D spectra as heatmaps or slices

### Reporting

- As a user, I want to select specific processed plots for inclusion in a report
- As a user, I want to review selected report items directly from the sample workspace
- As a user, I want to remove individual plots or clear the report selection
- As a user, I want to export a PDF report that includes plots, captions, and key metadata
- As a user, I want exported reports to be reproducible and traceable to the processing parameters used

---

## Scope Boundaries

This project intentionally focuses on a well-defined subset of functionality.

Included in scope:

- Import and parsing of Bruker EPR data archives
- Automatic experiment type inference
- Interactive visualization and basic processing
- Reproducible report generation
- User authentication and guest access
- Persistent storage using a relational database and object storage
- API-driven frontend-backend communication
- Automated testing, containerization, and cloud deployment

---

## Non-Goals

The following are explicitly out of scope for this project:

- Real-time collaboration between users
- Advanced multi-user permission models beyond private vs guest access
- Full replacement of proprietary EPR processing software
- Manual phase correction, advanced fitting pipelines, or custom pulse sequence editors
- Long-term archival guarantees or regulatory compliance
- Support for non-Bruker EPR formats
- High-performance batch processing of very large datasets

These limitations are intentional in order to keep the system focused, testable, and suitable for incremental extension.

---

## Summary

This project demonstrates how a complex scientific data workflow can be transformed into a reproducible, full-stack web application. It integrates frontend visualization, backend processing, database persistence, and report generation under a clear API contract, while remaining accessible through both guest and authenticated usage modes.

The application is designed as a realistic foundation for future expansion into more advanced EPR data analysis and laboratory data management systems.