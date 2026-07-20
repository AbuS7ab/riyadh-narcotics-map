# Narco Compliance

**Version: v1.0-beta**

Narco Compliance is a browser-based inspection workspace for narcotic and
controlled-drug facilities in the Riyadh region. It combines operational
dashboards, committee work queues, visit records, facility assignments, search,
and an interactive map in one Bootstrap RTL interface.

The application is a static frontend backed by Supabase. Operational datasets
are stored in the `app_data` table and cached in `localStorage` as a local
backup. Authentication is still implemented in the frontend user dataset; it
has not yet been migrated to Supabase Auth or protected by role-based RLS.

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

Fixed users are created automatically when the users dataset is empty. Existing
cloud users are preserved.

| Username | Default password | Role |
| --- | --- | --- |
| `admin` | `admin` | Administrator |
| `committee1` | `committee1` | Committee |
| `committee2` | `committee2` | Committee |
| `committee3` | `committee3` | Committee |
| `committee4` | `committee4` | Committee |

The administrator can update committee names, passwords, and activation status
from the user-management panel. These credentials are stored in the frontend
users dataset and cached locally. They are not a production security boundary.

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

1. Cloud datasets are loaded from Supabase before application state is built.
2. A valid local session determines the administrator or committee interface.
3. Facility reference data is loaded once from `data/facilities.json`.
4. Cloud revisions are checked every 30 seconds and when the tab becomes
   visible or the browser reconnects.
5. Filters update `filteredFacilities`.
6. `refreshView()` updates dashboard state and map markers without recreating
   the map or reloading the facility dataset.

## Persistence and synchronization

The current Supabase design stores each logical dataset as one JSON object in a
row of `app_data`. Writes use the row's `updated_at` value as an optimistic lock.
Visit and assignment commands retry conflicts against a fresh remote copy so
independent committee changes are preserved. Failed required cloud writes are
reported to the UI and are not presented as successful local-only changes.

Administrator edits use record-level collection patches. An unrelated record
added remotely is preserved, while a concurrent edit to the same record is
rejected for the administrator to reload and review. Multi-dataset operations,
such as data import or deleting a custom facility and its override, use
compensating rollback: if a later write fails, only records already changed by
that operation are restored. This is not a database transaction, so normalized
tables and a server-side transaction/RPC remain the long-term architecture.

The administrator synchronization-audit panel reads the latest users,
employees, assignments, and facility status without modifying them. It reports
broken references, duplicate or missing identifiers, participant gaps, and
assignment/visit state mismatches. Automatic recovery is intentionally limited
to a completed visit that still has an open assignment when the visit and
assignment have the same identifiers, facility, and committee. Every recovery
is revalidated against fresh cloud data and requires an administrator preview
and confirmation.

`localStorage` remains a backup/cache for these keys:

- `narcoUsers`
- `currentUser`
- `facilityStatus`
- `facilityAssignments`

Clearing site data removes the local session and cache, but does not remove
records stored in Supabase.

This JSON-row model is an interim architecture. Supabase Auth, RLS policies,
and normalized visit/assignment tables are required before treating frontend
roles as a production security boundary.

## Synchronization tests

Run the full local CI command without installing dependencies:

```bash
npm run ci
```

The test suite is split into cloud synchronization, visit workflow, assignment
workflow, administrator write-safety, and synchronization-audit tests. It
covers optimistic locking, stale-write rejection, serialization, immutable
cache reads, insert/update conflicts, atomic refresh, visit idempotency, failed
writes, selective rollback, incomplete visits, assignment replacement
protection, and concurrent bulk
assignment operations. Administrator tests also verify same-record conflict
rejection, preservation of unrelated remote records, in-memory commit only
after cloud success, and compensating rollback for a partially failed import.

GitHub Actions runs the same command for every pull request targeting `main`
and for every push to `main`.

## Deployment

The application is ready to be hosted as a static site with GitHub Pages. The
production custom domain is:

<https://ncp-sa.net>

The repository-root `CNAME` file configures GitHub Pages to use `ncp-sa.net`.
Publish the repository root from the selected GitHub Pages branch; no build
command or generated output directory is required.

## Release history

See [CHANGELOG.md](CHANGELOG.md) for release notes.
