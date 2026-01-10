const express = require('express')
const mysql = require('mysql2')
const app = express()
const port = 3000

const connection = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    database: 'market',
})

connection.connect((err) => {
    err && console.error(`error connecting to database ${err}`);
})

app.use(express.json())
app.listen(port, () => {
    console.log(`server is running on port:: ${port}`);
})

// server check
app.get('', (req, res) => {
    return res.json({
        success: true,
        message: 'server is running'
    })
})

// products
app.post('/addCategoryColumn', (req, res) => {
    const query = `
    ALTER TABLE products
    ADD COLUMN (category varchar(100) NOT null );
    `

    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        return res.status(201).json({
            success: true,
            message: 'category column added successfully to products table'
        })
    })
})

app.post('/dropCategoryColumn', (req, res) => {
    const query = `
    ALTER TABLE products
    DROP COLUMN category;
    `

    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        return res.status(200).json({
            success: true,
            message: 'category column dropped successfully from products table'
        })
    })
})

app.post('/modifySupplierPhoneLen/:len', (req, res) => {
    let { len } = req.params
    len = Number(len)


    if (!len || typeof (len) !== 'number') {
        return res.status(401).json({
            success: false,
            message: !len ? 'length is required' : 'length must be a number'
        })
    }
    const query = `
    ALTER TABLE suppliers 
    modify phone varchar(${len}) not null;
    `

    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(400).json({ success: false, message: err.sqlMessage })
        }
        return res.status(201).json({
            success: true,
            message: `suppliers phone length updated successfully to ${len}`
        })
    })
})

app.post('/addProductNameNotnullConstraint', (req, res) => {
    const query = `
    ALTER TABLE products
    MODIFY name varchar(50) NOT NULL
    `

    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(400).json({ success: false, message: err.sqlMessage })
        }
        console.log({ result });
        res.json({ success: true, message: 'constraint added successfully' })
    })
})

app.post('/product/add', (req, res) => {
    const { name, price, stock_quantity, supplier_id, category } = req.body

    if (!name || !price || !stock_quantity || !supplier_id || !category) {
        return res.status(400).json({
            success: false,
            message: 'name, price, stock_quantity, supplier_id and category are required'
        })
    }

    const existProductQuery = `
    select * from products
    where name = ?
    `

    connection.execute(existProductQuery, [name], (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        if (result.length) {
            return res.status(409).json({
                success: false,
                message: 'product name already exist'
            })
        }

        const supplierCheckQuery = `
        select * from suppliers
        where id = ?
        `

        connection.execute(supplierCheckQuery, [supplier_id], (err, result) => {
            if (err) {
                console.error('error excecuting query:\n', err);
                return res.status(500).json({ success: false, message: err.sqlMessage })
            }
            if (!result.length) {
                return res.status(404).json({
                    success: false,
                    message: 'supplier not exist'
                })
            }
            const productInsertQuery = `
            insert into products(name, price, stock_quantity, supplier_id, category)
            values(?,?,?,?,?)
            `

            connection.execute(productInsertQuery, [name, price, stock_quantity, supplier_id, category], (err, result) => {
                if (err) {
                    console.error('error excecuting query:\n', err);
                    return res.status(500).json({ success: false, message: err.sqlMessage })
                }
                if (result.affectedRows) {
                    return res.status(201).json({
                        success: true,
                        message: 'product added successfully',
                        data: {
                            id: result.insertId,
                            ...req.body
                        }
                    })
                }
            })
        })

    })
})

app.post('/product/sell/:product_id', (req, res) => {
    const { sold_quantity } = req.body
    const { product_id } = req.params

    const existProductQuery = `
    select * from products
    where id = ?
    `

    connection.execute(existProductQuery, [product_id], (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        if (!result.length) {
            return res.status(404).json({
                success: false,
                message: 'product not found'
            })
        }

        if (result[0].stock_quantity < sold_quantity) {
            return res.status(422).json({ success: false, message: result[0].stock_quantity == 0 ? `product sold out` : `only ${result[0].stock_quantity} products remaining` })
        }

        const updateQuery = `
        update products
        set stock_quantity = stock_quantity-?
        where id = ?;
        `

        connection.execute(updateQuery, [sold_quantity, product_id], (err, result) => {
            if (err) {
                console.error('error excecuting query:\n', err);
                return res.status(500).json({ success: false, message: err.sqlMessage })
            }

            if (result.affectedRows == 0) {
                return res.status(500).json({
                    success: false,
                    message: 'error updating stock quantity'
                })
            }

            const insertQuery = `
            insert into sales(product_id,sold_quantity)
            values(?,?);
            `

            connection.execute(insertQuery, [product_id, sold_quantity], (err, result) => {
                if (result.affectedRows == 0 || err) {
                    const rollbackQuery = `
                    update products
                    set stock_quantity = stock_quantity+?
                    where id = ?;
                    `

                    connection.execute(rollbackQuery, [sold_quantity, product_id], (err, result) => {
                        if (err) {
                            console.error('error excecuting query:\n', err);
                            return res.status(500).json({ success: false, message: err.sqlMessage })
                        }
                        return res.status(500).json({ success: false, message: 'error adding sales' })
                    })
                }

                return res.status(201).json({
                    success: true,
                    message: 'product sold successfully'
                })
            })
        })
    })
})

app.patch('/product/priceUpdate/:product_id', (req, res) => {
    const { price } = req.body
    const { product_id } = req.params

    if (!price || !product_id) {
        return res.status(400).json({
            success: false,
            message: "price and product_id are required"
        })
    }

    const existQuery = `
    select * from products
    where id = ?
    `

    connection.execute(existQuery, [product_id], (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }

        const updateQuery = `
        update products
        set price = ?
        where id = ?
        `

        connection.execute(updateQuery, [price, product_id], (err, result) => {
            if (err) {
                console.error('error excecuting query:\n', err);
                return res.status(500).json({ success: false, message: err.sqlMessage })
            }

            return res.status(200).json({
                success: true,
                message: 'product updated successfully'
            })
        })
    })
})

app.delete('/product/:product_id', (req, res) => {
    const { product_id } = req.params
    if (!product_id) {
        return res.status(400).json({
            success: false,
            message: 'product_id is required'
        })
    }

    const searchQuery = `
    select * from products
    where id = ?
    `

    connection.execute(searchQuery, [product_id], (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }

        if (!result.length) {
            return res.status(404).json({
                success: false,
                message: 'product not found'
            })
        }

        const deleteQuery = `
        delete from products
        where id = ?
        `

        connection.execute(deleteQuery, [product_id], (err, result) => {
            if (err) {
                console.error('error excecuting query:\n', err);
                return res.status(500).json({ success: false, message: err.sqlMessage })
            }

            return res.status(200).json({
                success: true,
                message: 'product deleted successfully'
            })
        })
    })
})

app.get('/product/totalQuantity', (req, res) => {
    const query = `
    select p.id, p.name, p.price, count(s.sold_quantity) as sold_quantity, p.price*count(s.sold_quantity) as total_sales
    from products as p
    left join sales as s
    on p.id = s.product_id
    group by p.id
    `

    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        return res.status(200).json({
            success: false,
            message: 'products retrieved successfully',
            data: result
        })
    })

})

app.get('/product/maxStock', (req, res) => {
    const query = `
    select *
    -- select id, name, price, max(stock_quantity) as max_stock_quantity
    from products 
    where stock_quantity = (select max(stock_quantity) from products)    
    `

    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        return res.status(200).json({
            success: false,
            message: 'products retrieved successfully',
            data: result
        })
    })

})

app.get('/product/notSold', (req, res) => {
    const query = `
    select p.* from 
    products as p
    left join sales as s
    on s.product_id = p.id
    where s.product_id is null
    `

    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        return res.status(200).json({
            success: false,
            message: 'products retrieved successfully',
            data: result
        })
    })
})

// sales
app.get('/salesWithProducts', (req, res) => {
    const query = `
    select s.*, p.name as product_name
    from sales as s join products as p
    on s.product_id = p.id
    `
    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }

        const formatedResult = result.map((r) => {
            return {
                id: r.id,
                sold_quantity: r.sold_quantity,
                sale_date: r.sale_date,
                product: {
                    id: r.product_id,
                    name: r.product_name
                }
            }
        })

        return res.json({
            success: true,
            message: 'sales retrieved successfully',
            data: formatedResult
        })
    })
})

// suppliers
app.post('/supplier/add', (req, res) => {
    const { name, phone } = req.body

    if (!name || !phone) {
        return res.status(400).json({
            success: false,
            message: 'all fields are required'
        })
    }

    const existSupplierQuery = `
    select * from suppliers
    where phone = ?
    `

    connection.execute(existSupplierQuery, [phone], (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        if (result.length) {
            return res.status(409).json({ success: false, message: 'phone number already exist' })
        }

        const insertQuery = `
        insert into suppliers(name,phone)
        values(?,?)
        `

        connection.execute(insertQuery, [name, phone], (err, result) => {
            if (err) {
                console.error('error excecuting query:\n', err);
                return res.status(500).json({ success: false, message: err.sqlMessage })
            }
            return res.status(201).json({
                success: true,
                message: 'supplier created successfully',
                data: {
                    id: result.insertId,
                    name,
                    phone
                }
            })
        })

    })

})

app.get('/supplier', (req, res) => {
    const { letter } = req.query

    const query = `
    select * from suppliers
    ${letter ? `where name like '${letter[0]}%'` : ''}
    `
    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        return res.json({
            success: true,
            message: 'suppliers retrieved successfully',
            data: result
        })
    })
})

// permissions
app.get('/users', (req, res) => {
    const query = `
    select user,host from mysql.user 
    `

    connection.execute(query, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }
        return res.json({
            success: true,
            message: 'users retrieved successfully',
            data: result
        })
    })
})

app.post('/users/store_manager', (req, res) => {
    const { user, password } = req.body

    const searchQuery = `
    select user,host from mysql.user 
    where user = 'store_manager'
    `

    connection.execute(searchQuery, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }

        if (result.length) {
            return res.status(409).json({
                success: false,
                message: 'user already exist'
            })
        }

        const createUserQuery = `
        CREATE USER 'store_manager'@'localhost' IDENTIFIED BY 'password';
        `

        connection.execute(createUserQuery, [password], (err, result) => {
            if (err) {
                console.error('error excecuting query:\n', err);
                return res.status(500).json({ success: false, message: err.sqlMessage })
            }

            const accessQuery = `
            GRANT SELECT, UPDATE, INSERT ON market.* TO 'store_manager'@'localhost'
            `

            connection.execute(accessQuery, (err, result) => {
                if (err) {
                    console.error('error excecuting query:\n', err);
                    return res.status(500).json({ success: false, message: err.sqlMessage })
                }

                return res.status(201).json({
                    success: true,
                    message: "store_manager user created sucessfully with SELECT, UPDATE, INSERT access"
                })
            })


        })
    })
})

app.patch('/users/store_manager/revokeUpdate', (req, res) => {
    const searchQuery = `
    select user,host from mysql.user 
    where user = 'store_manager'
    `

    connection.execute(searchQuery, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }

        if (!result.length) {
            return res.status(404).json({
                success: false,
                message: 'user not found'
            })
        }

        const accessQuery = `
        REVOKE UPDATE ON market.* TO 'store_manager'@'localhost'
        `

        connection.execute(accessQuery, (err, result) => {
            if (err) {
                console.error('error excecuting query:\n', err);
                return res.status(500).json({ success: false, message: err.sqlMessage })
            }

            return res.status(200).json({
                success: true,
                message: "store_manager has revoked UPDATE access sucessfully"
            })
        })
    })
})

app.patch('/users/store_manager/grantDelete', (req, res) => {
    const searchQuery = `
    select user,host from mysql.user 
    where user = 'store_manager'
    `

    connection.execute(searchQuery, (err, result) => {
        if (err) {
            console.error('error excecuting query:\n', err);
            return res.status(500).json({ success: false, message: err.sqlMessage })
        }

        if (!result.length) {
            return res.status(404).json({
                success: false,
                message: 'user not found'
            })
        }

        const accessQuery = `
        GRANT DELETE ON market.sales TO 'store_manager'@'localhost'
        `

        connection.execute(accessQuery, (err, result) => {
            if (err) {
                console.error('error excecuting query:\n', err);
                return res.status(500).json({ success: false, message: err.sqlMessage })
            }

            return res.status(200).json({
                success: true,
                message: "store_manager has granted DELETE sucessfully"
            })
        })
    })
})

app.all('*d', (req, res) => {
    return res.status(404).json({
        success: false,
        message: 'invalid url or method'
    })
})