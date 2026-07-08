# Narco Compliance

**Version: v1.0-beta**

Narco Compliance is a browser-based inspection workspace for narcotic and
controlled-drug facilities in the Riyadh region. It combines operational
dashboards, committee work queues, visit records, facility assignments, search,
and an interactive map in one Bootstrap RTL interface.

The beta is a fully local, frontend-only application. Users, sessions, facility
status, visit history, and assignments are persisted in the browser with
`localStorage`; there is no backend or external authentication service.

## Main features

- **Login and roles:** persistent local sessions for administrator and committee
  accounts, including inactive-account enforcement and logout.
- **Admin dashboard:** facility KPIs, operational status totals, completion
  percentage, interactive filters, and committee workload cards.
- **Committee users:** committee-specific navigation and assigned-facility work
  queues while retaining map and search access to all facilities.
- **Visit workflow:** record visit date, result, violation status, and notes from
  the facility sidebar.
- **Visit history:** append-only facility visit records with latest-state
  derivation and annual visit progress.
- **Manual assignment:** assign one facility from its details or bulk-assign
  selected unassigned facilities through the Assignment Board.
- **Smart assignment by distance:** assign the nearest unassigned facilities
  using Haversine distance and an optional starting facility. Without an
  explicit start, the system uses the latest committee visit, latest completed
  assignment, or Riyadh center.
- **Interactive map and search:** Leaflet marker clustering, facility search,
  filtering, drilldowns, and marker navigation.

## Local setup

No installation or build step is required.

1. Clone or download the repository.
2. Open a terminal in the project directory.
3. Start a local static server:

   ```bash
   python3 -m http.server 8000
   ```

4. Open <http://localhost:8000> in a modern browser.

Opening `index.html` directly is not recommended because the application loads
`data/facilities.json` with `fetch`, which browsers commonly restrict for local
files.

The interface loads Bootstrap RTL, Leaflet, Leaflet MarkerCluster, and Font
Awesome from public CDNs, so internet access is required for those assets and
the OpenStreetMap tile layer.

## Default users

Fixed users are created automatically on first load. Existing locally saved
users are preserved.

| Username | Default password | Role |
| --- | --- | --- |
| `admin` | `admin` | Administrator |
| `committee1` | `committee1` | Committee |
| `committee2` | `committee2` | Committee |
| `committee3` | `committee3` | Committee |
| `committee4` | `committee4` | Committee |

The administrator can update committee names, passwords, and activation status
from the user-management panel. These credentials are stored locally and are
intended only for this frontend beta—not for production security.

## Role summary

### Administrator

- Views the full dashboard, committee cards, users, and Assignment Board.
- Views and manages all facilities, assignments, visits, and violations.
- Performs manual, bulk, and smart distance-based assignment.

### Committee

- Searches and views all facilities on the map.
- Uses assignments as a work queue, not as an access restriction.
- Adds new visit records but cannot edit or delete historical visits.
- Cannot access the global dashboard, user management, assignment controls, or
  administrative reports.

## Architecture

The project uses plain JavaScript modules loaded in dependency order from
`index.html`.

| File | Responsibility |
| --- | --- |
| `js/app.js` | Application startup, facility loading, map creation, and view refresh coordination. |
| `js/users.js` | Users, sessions, roles, assignments, committee cards, Assignment Board, and smart assignment. |
| `js/status.js` | Facility operational state, visit history, latest-state derivation, and persistence. |
| `js/markers.js` | Facility markers, clustering, and map navigation. |
| `js/dashboard.js` | KPI calculations, active KPI state, and dashboard drilldowns. |
| `js/filters.js` | Central filter state and filtered-facility pipeline. |
| `js/search.js` | Facility search and search-result navigation. |
| `js/sidebar.js` | Facility details, visit workflow/history, assignments, and drilldown lists. |
| `index.html` | RTL application structure, login screen, dashboard, map workspace, and admin panels. |
| `css/style.css` | Narco Compliance branding, layout, responsive behavior, and component styling. |
| `data/facilities.json` | Facility reference dataset. |

### Runtime flow

1. Fixed users and persisted state are restored from `localStorage`.
2. A valid session determines the administrator or committee interface.
3. Facility data is loaded once from `data/facilities.json`.
4. Filters update `filteredFacilities`.
5. `refreshView()` updates dashboard state and map markers without recreating
   the map or reloading the facility dataset.

## Local persistence

The beta uses these browser storage keys:

- `narcoUsers`
- `currentUser`
- `facilityStatus`
- `facilityAssignments`

Clearing site data removes locally saved sessions and operational records.

## Release history

See [CHANGELOG.md](CHANGELOG.md) for release notes.
