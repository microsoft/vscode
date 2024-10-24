# Blood Cancer Detection Model

This directory contains a Python script for detecting early-stage blood cancer using a machine learning model. The model is built using `numpy`, `pandas`, `scikit-learn`, and `tensorflow`.

## Instructions for Running the Model

1. **Install Dependencies**: Ensure you have the required dependencies installed. You can install them using the following command:
   ```bash
   pip install numpy pandas scikit-learn tensorflow
   ```

2. **Prepare the Dataset**: Place your blood cancer dataset in the same directory as the script. The dataset should be in CSV format and should have a column named `target` which contains the labels.

3. **Run the Script**: Execute the script to train and evaluate the model. Use the following command:
   ```bash
   python blood_cancer_detection.py
   ```

## Dependencies

- `numpy`: For numerical operations
- `pandas`: For data manipulation and analysis
- `scikit-learn`: For machine learning algorithms and data preprocessing
- `tensorflow`: For building and training the neural network

## Dataset

The dataset should be in CSV format and should contain the following columns:
- Features: The columns representing the features of the dataset.
- `target`: The column containing the labels (0 or 1) indicating the presence or absence of blood cancer.

Make sure to update the `file_path` variable in the script to point to your dataset file.
