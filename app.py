from flask import Flask, render_template, request, redirect, session, url_for, flash, jsonify
import sqlite3
import threading, time, random
import os

app = Flask(__name__)
app.secret_key = "supersecretkey123"

DB_PATH = os.path.join(app.root_path, 'users.db')

# Ambulance data and simulation
data = {
    "lat": 17.385,
    "lng": 78.486,
    "speed": 60
}


def simulate():
    while True:
        data["lat"] += random.uniform(-0.001, 0.001)
        data["lng"] += random.uniform(-0.001, 0.001)
        data["speed"] = random.randint(50, 80)
        time.sleep(2)


messages = []


def get_db_connection():
    return sqlite3.connect(DB_PATH)


def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE NOT NULL,
                  password TEXT NOT NULL,
                  email TEXT,
                  phone TEXT,
                  role TEXT DEFAULT 'driver')''')

    c.execute("PRAGMA table_info(users)")
    existing_columns = {column[1] for column in c.fetchall()}

    required_columns = {
        "email": "ALTER TABLE users ADD COLUMN email TEXT",
        "phone": "ALTER TABLE users ADD COLUMN phone TEXT",
        "role": "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'driver'"
    }

    for column_name, statement in required_columns.items():
        if column_name not in existing_columns:
            c.execute(statement)

    conn.commit()
    conn.close()


def get_user(username):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "SELECT id, username, password, email, phone, role FROM users WHERE username = ?",
        (username,)
    )
    result = c.fetchone()
    conn.close()

    if not result:
        return None

    return {
        "id": result[0],
        "username": result[1],
        "password": result[2],
        "email": result[3],
        "phone": result[4],
        "role": result[5]
    }


def create_user(username, password, email, phone, role):
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute(
            "INSERT INTO users (username, password, email, phone, role) VALUES (?, ?, ?, ?, ?)",
            (username, password, email, phone, role)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


init_db()


@app.before_request
def protect_routes():
    protected_paths = ['/dashboard', '/support']
    if request.path in protected_paths and 'user' not in session:
        flash('Please login first.', 'warning')
        return redirect(url_for('login'))


@app.route('/')
def home():
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return render_template('index.html')


@app.route('/api/location')
def api_location():
    return jsonify(data)


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        user = get_user(username)
        if user and user['password'] == password:
            session['user'] = username
            session['role'] = user['role']
            flash('Login successful!', 'success')
            return redirect(url_for('dashboard'))
        flash('Invalid username or password.', 'error')
    return render_template('login.html', username=None)


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        username = request.form['username'].strip()
        email = request.form['email'].strip()
        phone = request.form['phone'].strip()
        password = request.form['password']
        role = request.form['role'].strip().lower()

        valid_roles = {'admin', 'driver'}

        if not username or not email or not phone:
            flash('All fields are required.', 'error')
            return render_template('signup.html', username=None)

        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'error')
            return render_template('signup.html', username=None)

        if role not in valid_roles:
            flash('Please select a valid role.', 'error')
            return render_template('signup.html', username=None)

        if not create_user(username, password, email, phone, role):
            flash('Username already exists.', 'error')
            return render_template('signup.html', username=None)

        flash('Account created! Please login.', 'success')
        return redirect(url_for('login'))

    return render_template('signup.html', username=None)


@app.route('/dashboard')
def dashboard():
    user = get_user(session.get('user'))
    role = user['role'] if user else session.get('role', 'driver')
    session['role'] = role
    return render_template(
        'dashboard.html',
        username=session.get('user'),
        role=role
    )


@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('role', None)
    flash('Logged out successfully.', 'info')
    return redirect(url_for('home'))


@app.route('/support', methods=['GET', 'POST'])
def support():
    if request.method == 'POST':
        name = request.form.get('name', '')
        email = request.form.get('email', '')
        message = request.form.get('message', '')
        submission = f"Support: {name} ({email}): {message}"
        messages.append(submission)
        print(submission)
        flash('Your message has been sent successfully! We\'ll get back to you soon.', 'success')
        return redirect(url_for('support'))
    return render_template('support.html', username=session.get('user'))


if __name__ == "__main__":
    threading.Thread(target=simulate, daemon=True).start()
    app.run(port=8000, debug=True)
