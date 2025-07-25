-- Single-line comment
/* Multi-line
   comment */

SELECT
    users.id AS user_id,
    COUNT(orders.*) AS order_count,
    CONCAT(first_name, ' ', last_name) AS full_name
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.date > '2023-01-01'
GROUP BY users.id
HAVING COUNT(orders.*) > 5
ORDER BY order_count DESC
LIMIT 10;
