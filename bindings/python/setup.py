from setuptools import setup, find_packages

setup(
    name='mc-launcher-core',
    version='1.0.0',
    description='Minecraft Launcher Python SDK - 通过 subprocess 调用 Node.js CLI',
    author='MC Launcher Core',
    packages=find_packages(),
    python_requires='>=3.7',
    classifiers=[
        'Programming Language :: Python :: 3',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
    ],
)
