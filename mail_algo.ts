// https://stackoverflow.com/questions/21900713/finding-all-connected-components-of-an-undirected-graph

// Breadth First Search function
// v is the source vertex
// all_pairs is the input array, which contains length 2 arrays
// visited is a dictionary for keeping track of whether a node is visited
var bfs = function (v, all_pairs, visited) {
    var q = [];
    var current_group = [];
    var i, nextVertex, pair;
    var length_all_pairs = all_pairs.length;
    q.push(v);
    while (q.length > 0) {
        v = q.shift();
        if (!visited[v]) {
            visited[v] = true;
            current_group.push(v);
            // go through the input array to find vertices that are
            // directly adjacent to the current vertex, and put them
            // onto the queue
            for (i = 0; i < length_all_pairs; i += 1) {
                pair = all_pairs[i];
                if (pair[0] === v && !visited[pair[1]]) {
                    q.push(pair[1]);
                } else if (pair[1] === v && !visited[pair[0]]) {
                    q.push(pair[0]);
                }
            }
        }
    }
    // return everything in the current "group"
    return current_group;
};


function find_groups(pairs: string[][]): string[][] {
    var groups = [];
    var i, k, length, u, v, src, current_pair;
    var visited = {};

    // main loop - find any unvisited vertex from the input array and
    // treat it as the source, then perform a breadth first search from
    // it. All vertices visited from this search belong to the same group
    for (i = 0, length = pairs.length; i < length; i += 1) {
        current_pair = pairs[i];
        u = current_pair[0];
        v = current_pair[1];
        src = null;
        if (!visited[u]) {
            src = u;
        } else if (!visited[v]) {
            src = v;
        }
        if (src) {
            // there is an unvisited vertex in this pair.
            // perform a breadth first search, and push the resulting
            // group onto the list of all groups
            groups.push(bfs(src, pairs, visited));
        }
    }
    return groups;
};

function test() {
    const pairs = [
        ["a2", "a5"],
        ["a3", "a6"],
        ["a4", "a5"],
        ["a7", "a9"]
    ];

    const groups = find_groups(pairs);
    console.log(groups);
}

module.exports = {
    find_groups
}