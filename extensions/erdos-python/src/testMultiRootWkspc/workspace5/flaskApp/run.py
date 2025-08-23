from flask import Flask, render_template
app = Flask(__name__)


@app.route('/')
def hello():
   return render_template('index.html',
                            value_from_server='this_is_a_value_from_server', 
                            another_value_from_server='this_is_another_value_from_server')


if __name__ == '__main__':
    app.run()
