https://www.highlion.net is the official HighLion project website.
The site features a collection of cybersecurity related services, including news, live session stats, a Debian terminal to explore, and more.

My other projects are featured in the site as well, see /projects and /about to find out more.
A letterbox can be found at /contact, your words are welcome.

HLv8 checks

Run the shell regression suite with `node tests/shell.test.cjs`.
Run the endpoint suite with `python tests/api_test.py /path/to/php` (PHP 8+).
The endpoint suite uses disposable credentials, sessions, and storage under the ignored `.qa/` directory. It never reads production configuration.

The existing root hash keys authenticate `admin`, which also requires the operator cookie. The existing admin hash keys authenticate the simulated `root` account. Keep their values in the server environment file.
Authenticated developers can run `sessionctl help` for session controls.
